// 카드 문서 탭의 canvas: 변환·전달, 상태 저장, IDE 동작, 에이전트 요청 (TASK-3 CV, CA).

import * as path from 'node:path';
import * as vscode from 'vscode';
import { canvasLiterals, canvasMode, compileCanvas, encodeLiteral, figureLines } from '../runner/canvas';
import { canvasChatPrompt, canvasFixPrompt, canvasPrompt } from '../runner/prompt';
import type { RunService } from '../runner/runService';
import type { CanvasActionMessage, CanvasPayload, DocTarget, ToExtension } from '../shared/protocol';
import { TASK_DOCS } from '../core/types';
import { readTextIfExists, toJson, writeFileAtomic } from '../storage/fsutil';
import type { BoardController } from './boardController';

const SHARED = 'shared:';

/** 공용 문서 중 보드 안에서 문서로 그리는 형식 */
export function sharedDocKind(file: string): 'canvas' | 'markdown' | undefined {
  if (file.endsWith('.canvas.tsx')) return 'canvas';
  if (/\.(md|markdown)$/i.test(file)) return 'markdown';
  return undefined;
}

/** Markdown 공용 문서 옆의 그림 파일: `docs/api.md` → `docs/api.canvas.tsx` */
export function figuresFileFor(file: string): string {
  return file.replace(/\.(md|markdown)$/i, '.canvas.tsx');
}

/** 문서 화면에서 바로 고친 내용을 원문에 넣는다. 그사이 파일이 바뀌었으면 undefined. */
export function applyDocEdit(current: string, base: string, start: number, end: number, text: string): string | undefined {
  if (current !== base || start < 0 || end < start || end > current.length) return undefined;
  return current.slice(0, start) + text + current.slice(end);
}

export class CanvasController {
  /** 문서 탭이 보고 있는 카드 → 마지막으로 보낸 canvas 원문 */
  private readonly watched = new Map<string, string | undefined>();
  /** 카드 → 마지막으로 세션에 알린 오류 (CA-3 중복 방지) */
  private readonly notified = new Map<string, string>();

  constructor(
    private readonly board: BoardController,
    private readonly runs: RunService,
    readonly guidePath: string,
  ) {}

  private canvasPath(dir: string): string {
    return this.board.repo.canvasPath(dir);
  }

  private sharedFile(key: string): string | undefined {
    const doc = this.board.sharedDocs().find((d) => `${SHARED}${d.id}` === key);
    return doc && path.join(this.board.root, doc.path);
  }

  private stateFile(key: string): string {
    return path.join(this.board.repo.localDir, 'canvas-state', `${key.replace(/[^\w.-]/g, '_')}.json`);
  }

  private async readState(dir: string): Promise<Record<string, unknown>> {
    try {
      return JSON.parse((await readTextIfExists(this.stateFile(dir))) ?? '{}') as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async handle(msg: ToExtension): Promise<boolean> {
    switch (msg.type) {
      case 'loadCanvas':
        this.watched.set(msg.dir, undefined);
        await this.send(msg.dir, true);
        return true;
      case 'unwatchCanvas':
        this.watched.delete(msg.dir);
        return true;
      case 'canvasState': {
        // CV-5: 카드별로 이 기기에만 저장한다.
        const state = await this.readState(msg.dir);
        await writeFileAtomic(this.stateFile(msg.dir), toJson({ ...state, [msg.key]: msg.value }));
        return true;
      }
      case 'canvasAction':
        await this.action(msg.dir, msg.action);
        return true;
      case 'canvasError':
        await this.reportError(msg.dir, msg.message);
        return true;
      case 'openExternal':
        // CV-7: http·https만 연다.
        if (/^https?:\/\//i.test(msg.href)) await vscode.env.openExternal(vscode.Uri.parse(msg.href));
        return true;
      case 'requestCanvas':
        await this.runs.startImplementer(msg.dir, (card, docs) => canvasPrompt(card, docs, this.canvasPath(msg.dir), this.guidePath));
        return true;
      case 'fixCanvas':
        await this.runs.startImplementer(msg.dir, (card) => canvasFixPrompt(card, this.canvasPath(msg.dir), this.guidePath, msg.error));
        return true;
      case 'createCanvas':
        await this.createTemplate(msg.dir);
        return true;
      case 'openCanvasFile':
        await this.openCode(msg.dir, msg.line);
        return true;
      case 'editDocText':
        await this.editText(msg);
        return true;
      default:
        return false;
    }
  }

  /** 보드를 다시 읽을 때 보고 있는 canvas가 바뀌었으면 다시 보낸다 (CV-1). */
  async refresh(): Promise<void> {
    for (const dir of this.watched.keys()) await this.send(dir, false);
  }

  /** 그림·canvas 코드 파일. 카드는 canvas.tsx, 공용 문서는 canvas 문서 자체 또는 Markdown 옆의 그림 파일이다. */
  private codeFile(dir: string): string | undefined {
    if (!dir.startsWith(SHARED)) return this.canvasPath(dir);
    const file = this.sharedFile(dir);
    const kind = file && sharedDocKind(file);
    return kind === 'canvas' ? file : kind === 'markdown' ? figuresFileFor(file!) : undefined;
  }

  private targetFile(dir: string, target: DocTarget): string | undefined {
    if (target === 'code') return this.codeFile(dir);
    if (target === 'markdown') return dir.startsWith(SHARED) ? this.sharedFile(dir) : undefined;
    return dir.startsWith(SHARED) || !TASK_DOCS.includes(target) ? undefined : this.board.taskDocPath(dir, target);
  }

  private async send(dir: string, force: boolean): Promise<void> {
    const shared = dir.startsWith(SHARED);
    const file = shared ? this.sharedFile(dir) : undefined;
    const kind = file ? sharedDocKind(file) : undefined;
    const main = file ? await readTextIfExists(file) : undefined;
    const codeFile = this.codeFile(dir);
    const source = codeFile ? await readTextIfExists(codeFile) : undefined;
    // 카드 문서는 작업 문서를 바탕으로 그리므로 작업 문서가 바뀌어도 다시 보낸다.
    const docs = shared
      ? undefined
      : {
          intent: await this.board.repo.readTaskDoc(dir, 'intent'),
          spec: await this.board.repo.readTaskDoc(dir, 'spec'),
          plan: await this.board.repo.readTaskDoc(dir, 'plan'),
        };
    const signature = JSON.stringify([main ?? null, source ?? null, docs ?? null]);
    if (!force && signature === this.watched.get(dir)) return;
    this.watched.set(dir, signature);
    const card = shared ? undefined : this.board.getCard(dir);
    const rel = (f: string) => path.relative(this.board.root, f);
    const payload: CanvasPayload = {
      dir,
      kind: shared ? 'shared' : 'card',
      exists: shared ? main !== undefined : source !== undefined,
      trusted: vscode.workspace.isTrusted,
      state: await this.readState(dir),
      canStart: !!card?.agents.implementer,
      docs,
      path: file ? rel(file) : codeFile && rel(codeFile),
    };
    if (kind === 'markdown') payload.markdown = main;
    else if (shared && main !== undefined && kind === undefined) payload.unsupported = true;
    if (source !== undefined && codeFile) {
      payload.mode = canvasMode(source);
      payload.source = source;
      payload.codePath = rel(codeFile);
      payload.literals = canvasLiterals(source);
      payload.figureLines = figureLines(source);
      if (payload.trusted) {
        const compiled = compileCanvas(source);
        if ('code' in compiled) payload.code = compiled.code;
        else {
          payload.error = compiled.line ? `${compiled.error} (line ${compiled.line})` : compiled.error;
          await this.reportError(dir, payload.error);
        }
      }
    }
    this.board.post({ type: 'canvas', payload });
  }

  /** 문서 화면에서 바로 고친 글자·절·체크박스를 원문에 넣는다. */
  private async editText(msg: Extract<ToExtension, { type: 'editDocText' }>): Promise<void> {
    const file = this.targetFile(msg.dir, msg.target);
    const current = file ? await readTextIfExists(file) : undefined;
    let text: string | undefined = msg.text;
    if (msg.literal && current !== undefined) {
      const literal = canvasLiterals(current).find((l) => l.start === msg.start && l.end === msg.end);
      text = literal && encodeLiteral(literal, current.slice(literal.start, literal.end), msg.text);
    }
    const next = current === undefined || text === undefined ? undefined : applyDocEdit(current, msg.base, msg.start, msg.end, text);
    if (!file || next === undefined) {
      this.board.post({ type: 'docTextConflict', dir: msg.dir });
      await this.send(msg.dir, true);
      return;
    }
    await writeFileAtomic(file, next);
    await this.send(msg.dir, false);
  }

  /** CA-3: 구현자 세션에 오류를 한 번만 알린다. */
  private async reportError(dir: string, message: string): Promise<void> {
    if (dir.startsWith(SHARED) || this.notified.get(dir) === message) return;
    this.notified.set(dir, message);
    await this.runs.notifyImplementer(
      dir,
      `[Agent Board] The canvas of ${dir} (${this.canvasPath(dir)}) failed to render: ${message}\nFix it following the canvas guide at ${this.guidePath}.`,
    );
  }

  /** CV-6 */
  private async action(dir: string, action: CanvasActionMessage): Promise<void> {
    if (action.type === 'openFile') {
      const root = this.board.root;
      const target = path.resolve(root, action.path);
      if (target !== root && !target.startsWith(root + path.sep)) {
        void vscode.window.showWarningMessage(this.board.t('msg.outsideRepo'));
        return;
      }
      const editor = await vscode.window.showTextDocument(vscode.Uri.file(target), { preview: false });
      const s = action.selection;
      if (s?.startLineNumber) {
        const start = new vscode.Position(s.startLineNumber - 1, Math.max(0, (s.startColumn ?? 1) - 1));
        const end = new vscode.Position((s.endLineNumber ?? s.startLineNumber) - 1, Math.max(0, (s.endColumn ?? s.startColumn ?? 1) - 1));
        editor.selection = new vscode.Selection(start, end);
        editor.revealRange(new vscode.Range(start, end));
      }
    } else if (action.type === 'openAgent') {
      const transcript = this.runs.transcriptForSession(action.agentId);
      if (transcript) await vscode.window.showTextDocument(vscode.Uri.file(transcript), { preview: true });
      else void vscode.window.showInformationMessage(this.board.t('msg.noTranscript'));
    } else if (action.type === 'newComposerChat') {
      const prompt = action.userPrompt?.trim();
      // 공용 문서는 담당 에이전트가 없으므로 요청할 곳이 없다.
      if (prompt && !dir.startsWith(SHARED)) await this.runs.startImplementer(dir, (card) => canvasChatPrompt(card, this.canvasPath(dir), prompt));
    }
  }

  /** 코드를 보드 옆 칸에 연다. 저장하면 문서가 바로 다시 그려진다. 코드 파일이 없는 공용 문서는 문서 파일을 연다. */
  private async openCode(dir: string, line?: number): Promise<void> {
    const code = this.codeFile(dir);
    const file = code && (await readTextIfExists(code)) !== undefined ? code : dir.startsWith(SHARED) ? this.sharedFile(dir) : undefined;
    if (!file) return this.createTemplate(dir);
    const editor = await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false, viewColumn: vscode.ViewColumn.Beside });
    if (line) {
      const at = new vscode.Position(Math.max(0, line - 1), 0);
      editor.selection = new vscode.Selection(at, at);
      editor.revealRange(new vscode.Range(at, at), vscode.TextEditorRevealType.InCenter);
    }
  }

  /** 그림 파일을 예시와 함께 만들고 옆 칸에 연다. */
  private async createTemplate(dir: string): Promise<void> {
    const file = this.codeFile(dir);
    if (!file) return;
    if ((await readTextIfExists(file)) === undefined) await writeFileAtomic(file, figuresTemplate());
    await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false, viewColumn: vscode.ViewColumn.Beside });
  }
}

/** 그림 모음 예시. md 문서에 ```canvas Example``` 블록을 넣으면 그 자리에 그려진다. */
export function figuresTemplate(): string {
  return `// 문서의 그림만 둡니다. 글은 intent·spec·plan.md에 씁니다.
// md에 아래처럼 쓰면 그 자리에 같은 이름의 컴포넌트가 그려집니다.
//
//   \`\`\`canvas Example
//   \`\`\`
import { Row, Stat } from "cursor/canvas";

export function Example() {
  return (
    <Row gap={24}>
      <Stat value="3" label="예시 지표" />
      <Stat value="80%" label="진행률" tone="success" />
    </Row>
  );
}
`;
}
