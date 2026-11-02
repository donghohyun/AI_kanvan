// AI 규칙: 보드의 규칙 문서 하나를 도구마다 읽는 파일(CLAUDE.md·AGENTS.md·.cursor/rules)로 만든다.
// 만든 파일은 다른 저장소에 따로 올라갈 수 있으므로 원본 경로를 가져오지 않고 본문을 그대로 넣는다.

import type { ToolId } from './types';

/** 보드가 만든 파일 첫 줄에 넣는 표시. 이 표시가 없는 파일은 덮어쓰지 않는다. */
export const GENERATED_MARK = 'agent-board:generated';
/** Codex는 AGENTS.md를 32KiB까지만 읽는다. 넘치는 규칙은 링크로 넘긴다. */
export const CODEX_INLINE_BUDGET = 24 * 1024;

export interface RuleSource {
  id: string;
  name: string;
  /** 레포 루트 기준 원본 경로 */
  path: string;
  tools: ToolId[];
  /** 적용 폴더. 빈 문자열이면 레포 전체 */
  scope: string;
  body: string;
}

export interface PlannedFile {
  /** 레포 루트 기준 경로 */
  path: string;
  tool: ToolId;
  scope: string;
  ruleIds: string[];
  content: string;
}

type Locale = 'ko' | 'en';

const TEXT = {
  ko: {
    header: '보드의 "AI 규칙"에서 고치세요. 이 파일을 직접 고치면 보드가 확인을 받아요.',
    more: '## 더 읽을 규칙',
    read: '작업 전에 읽고 따른다.',
  },
  en: {
    header: 'Edit this in the board\'s "AI rules". The board asks before overwriting manual edits.',
    more: '## More rules',
    read: 'read and follow before working.',
  },
};

export function isGenerated(text: string): boolean {
  return text.slice(0, 400).includes(GENERATED_MARK);
}

export function normalizeScope(scope: string): string {
  return scope.trim().replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/\/+$/, '');
}

function join(scope: string, file: string): string {
  return scope ? `${scope}/${file}` : file;
}

/** from 폴더에서 to 파일로 가는 상대 경로 */
export function relativePath(fromDir: string, to: string): string {
  const from = fromDir ? fromDir.split('/') : [];
  const parts = to.split('/');
  let i = 0;
  while (i < from.length && i < parts.length - 1 && from[i] === parts[i]) i += 1;
  return [...from.slice(i).map(() => '..'), ...parts.slice(i)].join('/');
}

function slug(rule: RuleSource): string {
  const base = rule.path.split('/').at(-1)!.replace(/\.(md|markdown|mdc)$/i, '');
  return base.replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || rule.id;
}

function header(locale: Locale): string {
  return `<!-- ${GENERATED_MARK} — ${TEXT[locale].header} -->`;
}

/** 규칙 목록으로 도구별 파일 내용을 정한다. 순서는 규칙 목록 순서다. */
export function planRuleFiles(rules: RuleSource[], locale: Locale = 'ko'): PlannedFile[] {
  const out: PlannedFile[] = [];
  const scopes = [...new Set(rules.map((r) => normalizeScope(r.scope)))];
  for (const scope of scopes) {
    const inScope = rules.filter((r) => normalizeScope(r.scope) === scope);
    const claude = inScope.filter((r) => r.tools.includes('claude'));
    if (claude.length) {
      out.push({
        path: join(scope, 'CLAUDE.md'),
        tool: 'claude',
        scope,
        ruleIds: claude.map((r) => r.id),
        content: [header(locale), ...claude.map((r) => r.body.trim())].join('\n\n') + '\n',
      });
    }
    const inlined = new Set<string>();
    const codex = inScope.filter((r) => r.tools.includes('codex'));
    if (codex.length) {
      let used = 0;
      const parts: string[] = [];
      const links: string[] = [];
      for (const r of codex) {
        const size = new TextEncoder().encode(r.body).length;
        if (used + size <= CODEX_INLINE_BUDGET) {
          used += size;
          inlined.add(r.id);
          parts.push(r.body.trim());
        } else {
          links.push(`- [${r.name}](${relativePath(scope, r.path)}): ${TEXT[locale].read}`);
        }
      }
      if (links.length) parts.push([TEXT[locale].more, '', ...links].join('\n'));
      out.push({
        path: join(scope, 'AGENTS.md'),
        tool: 'codex',
        scope,
        ruleIds: codex.map((r) => r.id),
        content: [header(locale), ...parts].join('\n\n') + '\n',
      });
    }
    // Cursor는 AGENTS.md도 읽으므로 거기 본문이 들어간 규칙은 따로 만들지 않는다.
    for (const r of inScope.filter((x) => x.tools.includes('cursor') && !inlined.has(x.id))) {
      out.push({
        path: join(scope, `.cursor/rules/${slug(r)}.mdc`),
        tool: 'cursor',
        scope,
        ruleIds: [r.id],
        content: `---\ndescription: ${r.name.replace(/\n/g, ' ')}\nalwaysApply: true\n---\n${header(locale)}\n\n${r.body.trim()}\n`,
      });
    }
  }
  return out;
}

/** CLAUDE.md의 `@경로` 가져오기 줄과 나머지 글 */
export function splitClaudeImports(text: string): { imports: string[]; rest: string } {
  const imports: string[] = [];
  const rest = text
    .split(/\r?\n/)
    .filter((line) => {
      const m = /^@(\S+)\s*$/.exec(line.trim());
      if (m) imports.push(m[1]!);
      return !m;
    })
    .join('\n')
    .trim();
  return { imports, rest };
}

export function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trim();
}

/** 본문 첫 제목. 파일 이름뿐인 제목(`# CLAUDE.md`)은 쓰지 않는다. */
export function ruleTitle(body: string, fallback: string): string {
  const m = /^#\s+(.+)$/m.exec(body);
  const title = m?.[1]?.trim();
  if (!title || /^(CLAUDE|AGENTS)\.md\b/i.test(title)) return fallback;
  return title;
}

/** 두 규칙 본문이 거의 같은지. 줄 집합이 90% 넘게 겹치면 같다고 본다. */
export function nearlySame(a: string, b: string): boolean {
  const lines = (t: string) => new Set(t.split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  const x = lines(a);
  const y = lines(b);
  if (x.size === 0 || y.size === 0) return false;
  let common = 0;
  for (const l of x) if (y.has(l)) common += 1;
  return common / Math.max(x.size, y.size) >= 0.9;
}
