// AI 규칙 파일 읽기·쓰기. 보드가 만든 파일만 고치고, 사람이 고친 파일은 확인을 받는다.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import {
  isGenerated,
  nearlySame,
  normalizeScope,
  planRuleFiles,
  ruleTitle,
  splitClaudeImports,
  stripFrontmatter,
  type PlannedFile,
  type RuleSource,
} from '../core/agentRules';
import type { BoardConfig, SharedDoc, ToolId } from '../core/types';
import type { RuleFileState, RulesState } from '../shared/protocol';
import { readTextIfExists, toJson, writeFileAtomic } from './fsutil';

export const RULES_DIR = '.agent-board/rules';
/** 규칙 파일을 찾지 않는 폴더 */
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'venv']);

export interface ImportResult {
  board: BoardConfig;
  /** 가져온 뒤 보드가 다시 만들 도구 파일 */
  replaced: string[];
  /** 규칙 폴더로 옮겨서 지울 파일 (CLAUDE.md가 가져오던 파일) */
  moved: string[];
}

function sha(text: string): string {
  return createHash('sha1').update(text).digest('hex');
}

function isRuleEntry(rel: string): boolean {
  return /(^|\/)(CLAUDE|AGENTS)\.md$/.test(rel) || /(^|\/)\.cursor\/rules\/[^/]+\.mdc$/.test(rel);
}

export class RulesSync {
  constructor(
    private readonly root: string,
    private readonly localDir: string,
    private readonly locale: 'ko' | 'en' = 'ko',
  ) {}

  private get recordFile(): string {
    return path.join(this.localDir, 'rules-sync.json');
  }

  private abs(rel: string): string {
    return path.join(this.root, ...rel.split('/'));
  }

  private async loadRecord(): Promise<Record<string, string>> {
    try {
      return JSON.parse((await readTextIfExists(this.recordFile)) ?? '{}') as Record<string, string>;
    } catch {
      return {};
    }
  }

  async sources(board: BoardConfig): Promise<RuleSource[]> {
    const docs = board.sharedDocs.filter((d): d is SharedDoc & { rule: NonNullable<SharedDoc['rule']> } => !!d.rule);
    return Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        name: d.name,
        path: d.path,
        tools: d.rule.tools,
        scope: normalizeScope(d.rule.scope),
        body: (await readTextIfExists(this.abs(d.path))) ?? '',
      })),
    );
  }

  async plan(board: BoardConfig): Promise<PlannedFile[]> {
    return planRuleFiles(await this.sources(board), this.locale);
  }

  /**
   * 규칙대로 도구 파일을 쓴다. 없거나 보드가 마지막에 쓴 그대로인 파일만 바꾼다.
   * force에 있는 경로는 사람이 고쳤어도 덮어쓴다.
   */
  async sync(board: BoardConfig, force: ReadonlySet<string> = new Set()): Promise<RulesState> {
    const sources = await this.sources(board);
    const plan = planRuleFiles(sources, this.locale);
    const record = await this.loadRecord();
    const next: Record<string, string> = {};
    const files = [];
    for (const f of plan) {
      const current = await readTextIfExists(this.abs(f.path));
      let state: RuleFileState = 'ok';
      if (current !== f.content) {
        const ours = current !== undefined && isGenerated(current) && record[f.path] === sha(current);
        if (current === undefined || ours || force.has(f.path)) await writeFileAtomic(this.abs(f.path), f.content);
        else state = isGenerated(current) ? 'edited' : 'unmanaged';
      }
      if (state === 'ok') next[f.path] = sha(f.content);
      else if (record[f.path]) next[f.path] = record[f.path]!;
      files.push({ ...f, state });
    }
    // 규칙에서 빠진 파일은 보드가 쓴 그대로일 때만 지운다.
    const planned = new Set(plan.map((f) => f.path));
    for (const [rel, hash] of Object.entries(record)) {
      if (planned.has(rel)) continue;
      const current = await readTextIfExists(this.abs(rel));
      if (current !== undefined && sha(current) === hash) await fs.rm(this.abs(rel), { force: true });
    }
    if (toJson(next) !== toJson(record)) await writeFileAtomic(this.recordFile, toJson(next));
    const duplicates: [string, string][] = [];
    sources.forEach((a, i) =>
      sources.slice(i + 1).forEach((b) => {
        if (a.scope === b.scope && nearlySame(a.body, b.body)) duplicates.push([a.id, b.id]);
      }),
    );
    return { files, importable: await this.findImportable(), duplicates };
  }

  /** 레포 루트와 바로 아래 폴더의 CLAUDE.md·AGENTS.md·.cursor/rules/*.mdc 중 보드가 만들지 않은 것 */
  async findImportable(): Promise<string[]> {
    const dirs = [''];
    for (const e of await fs.readdir(this.root, { withFileTypes: true }).catch(() => [])) {
      if (e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name)) dirs.push(e.name);
    }
    const found: string[] = [];
    for (const dir of dirs) {
      const prefix = dir ? `${dir}/` : '';
      const mdc = await fs.readdir(this.abs(`${prefix}.cursor/rules`)).catch(() => [] as string[]);
      const names = ['AGENTS.md', 'CLAUDE.md', ...mdc.filter((n) => n.endsWith('.mdc')).map((n) => `.cursor/rules/${n}`)];
      for (const name of names) {
        const text = await readTextIfExists(this.abs(prefix + name));
        if (text !== undefined && !isGenerated(text)) found.push(prefix + name);
      }
    }
    return found;
  }

  /**
   * 보드가 만들지 않은 규칙 파일을 규칙 문서로 옮긴다. 원본은 local/backup에 남긴다.
   * CLAUDE.md의 `@AGENTS.md`는 같은 규칙을 Claude에도 넘기는 것으로 본다.
   */
  async importFiles(board: BoardConfig): Promise<ImportResult> {
    const files = await this.findImportable();
    // AGENTS.md를 먼저 가져와야 CLAUDE.md의 `@AGENTS.md`를 같은 규칙에 붙일 수 있다.
    const order = (rel: string) => (rel.endsWith('AGENTS.md') ? 0 : rel.endsWith('.mdc') ? 1 : 2);
    files.sort((a, b) => order(a) - order(b));
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(this.localDir, 'backup', 'rules-import', stamp);
    let next = board;
    const bySource = new Map<string, string>();
    const moved: string[] = [];
    const usedFiles = new Set(board.sharedDocs.map((d) => d.path));
    const ko = this.locale === 'ko';

    const add = async (body: string, tools: ToolId[], scope: string, name: string, base: string): Promise<string> => {
      const stem = `${scope ? `${scope.replace(/\//g, '-')}-` : ''}${base}`.replace(/[^A-Za-z0-9_-]+/g, '-');
      let file = `${RULES_DIR}/${stem}.md`;
      for (let n = 2; usedFiles.has(file); n += 1) file = `${RULES_DIR}/${stem}-${n}.md`;
      usedFiles.add(file);
      await writeFileAtomic(this.abs(file), `${body.trim()}\n`);
      const used = new Set(next.sharedDocs.map((d) => d.id));
      let n = next.sharedDocs.length + 1;
      while (used.has(`doc-${n}`)) n += 1;
      const id = `doc-${n}`;
      next = { ...next, sharedDocs: [...next.sharedDocs, { id, name, category: 'convention', path: file, tags: [], rule: { tools, scope } }] };
      return id;
    };
    const addTool = (id: string, tool: ToolId) => {
      next = {
        ...next,
        sharedDocs: next.sharedDocs.map((d) =>
          d.id === id && d.rule && !d.rule.tools.includes(tool) ? { ...d, rule: { ...d.rule, tools: [...d.rule.tools, tool] } } : d,
        ),
      };
    };
    const fallbackName = (scope: string, tool: string) => (ko ? `${scope || '공통'} 규칙 (${tool})` : `${scope || 'Common'} rules (${tool})`);

    for (const rel of files) {
      const text = (await readTextIfExists(this.abs(rel))) ?? '';
      await writeFileAtomic(path.join(backupDir, ...rel.split('/')), text);
      const cursor = rel.endsWith('.mdc');
      const dir = cursor ? rel.replace(/\/?\.cursor\/rules\/[^/]+$/, '') : path.posix.dirname(rel).replace(/^\.$/, '');
      if (rel.endsWith('AGENTS.md')) {
        bySource.set(rel, await add(text, ['codex', 'cursor'], dir, ruleTitle(text, fallbackName(dir, 'Codex')), 'agents'));
      } else if (cursor) {
        const body = stripFrontmatter(text);
        const base = path.posix.basename(rel, '.mdc');
        await add(body, ['cursor'], dir, ruleTitle(body, base), base);
      } else {
        const { imports, rest } = splitClaudeImports(text);
        for (const imp of imports) {
          const target = path.posix.normalize(path.posix.join(dir || '.', imp));
          const known = bySource.get(target);
          if (known) {
            addTool(known, 'claude');
            continue;
          }
          const body = await readTextIfExists(this.abs(target));
          if (body === undefined || target.startsWith('..')) continue;
          await writeFileAtomic(path.join(backupDir, ...target.split('/')), body);
          const base = path.posix.basename(target).replace(/\.(md|markdown)$/i, '');
          bySource.set(target, await add(body, ['claude'], dir, ruleTitle(body, base), base));
          if (!isRuleEntry(target)) moved.push(target);
        }
        if (rest) await add(rest, ['claude'], dir, ruleTitle(rest, fallbackName(dir, 'Claude')), 'claude');
      }
    }
    return { board: next, replaced: files, moved };
  }

  async removeMoved(files: string[]): Promise<void> {
    for (const rel of files) await fs.rm(this.abs(rel), { force: true });
  }

  /** 보드가 만들 내용을 비교용 파일로 쓴다. */
  async writePreview(file: PlannedFile): Promise<string> {
    const out = path.join(this.localDir, 'rules-preview', ...file.path.split('/'));
    await writeFileAtomic(out, file.content);
    return out;
  }
}
