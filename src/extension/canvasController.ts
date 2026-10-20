// 카드 문서 탭의 canvas: 변환·전달, 상태 저장, IDE 동작, 에이전트 요청 (TASK-3 CV, CA).

import * as path from 'node:path';
import * as vscode from 'vscode';
import { compileCanvas } from '../runner/canvas';
import { canvasChatPrompt, canvasFixPrompt, canvasPrompt } from '../runner/prompt';
import type { RunService } from '../runner/runService';
import type { CanvasActionMessage, CanvasPayload, ToExtension } from '../shared/protocol';
import { readTextIfExists, toJson, writeFileAtomic } from '../storage/fsutil';
import type { BoardController } from './boardController';

const SHARED = 'shared:';

/** 공용 문서 중 보드 안에서 문서로 그리는 형식 */
export function sharedDocKind(file: string): 'canvas' | 'markdown' | undefined {
  if (file.endsWith('.canvas.tsx')) return 'canvas';
  if (/\.(md|markdown)$/i.test(file)) return 'markdown';
  return undefined;
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
      case 'openCanvasFile': {
        const file = msg.dir.startsWith(SHARED) ? this.sharedFile(msg.dir) : this.canvasPath(msg.dir);
        if (file) await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(file));
        return true;
      }
      default:
        return false;
    }
  }

  /** 보드를 다시 읽을 때 보고 있는 canvas가 바뀌었으면 다시 보낸다 (CV-1). */
  async refresh(): Promise<void> {
    for (const dir of this.watched.keys()) await this.send(dir, false);
  }

  private async send(dir: string, force: boolean): Promise<void> {
    const shared = dir.startsWith(SHARED);
    const file = shared ? this.sharedFile(dir) : this.canvasPath(dir);
    const source = file ? await readTextIfExists(file) : undefined;
    const kind = shared ? (file ? sharedDocKind(file) : undefined) : 'canvas';
    // canvas가 없는 카드는 작업 문서로 기본 문서를 그리므로, 작업 문서가 바뀌어도 다시 보낸다.
    const docs =
      !shared && source === undefined
        ? {
            intent: await this.board.repo.readTaskDoc(dir, 'intent'),
            spec: await this.board.repo.readTaskDoc(dir, 'spec'),
            plan: await this.board.repo.readTaskDoc(dir, 'plan'),
          }
        : undefined;
    const signature = source ?? JSON.stringify(docs ?? null);
    if (!force && signature === this.watched.get(dir)) return;
    this.watched.set(dir, signature);
    const card = shared ? undefined : this.board.getCard(dir);
    const payload: CanvasPayload = {
      dir,
      kind: shared ? 'shared' : 'card',
      exists: source !== undefined,
      trusted: vscode.workspace.isTrusted,
      state: await this.readState(dir),
      canStart: !!card?.agents.implementer,
      docs,
      path: file && path.relative(this.board.root, file),
    };
    if (source !== undefined && kind === 'markdown') payload.markdown = source;
    else if (source !== undefined && kind === undefined) payload.unsupported = true;
    else if (source !== undefined && payload.trusted) {
      const compiled = compileCanvas(source);
      if ('code' in compiled) payload.code = compiled.code;
      else {
        payload.error = compiled.line ? `${compiled.error} (line ${compiled.line})` : compiled.error;
        await this.reportError(dir, payload.error);
      }
    }
    this.board.post({ type: 'canvas', payload });
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

  /** 빈 canvas를 만들고 편집기에서 연다. */
  private async createTemplate(dir: string): Promise<void> {
    const file = this.canvasPath(dir);
    if ((await readTextIfExists(file)) === undefined) {
      const card = this.board.getCard(dir);
      await writeFileAtomic(file, canvasTemplate(card?.title ?? dir, card?.description));
    }
    await vscode.window.showTextDocument(vscode.Uri.file(file), { preview: false });
  }
}

export function canvasTemplate(title: string, description: string | undefined): string {
  const text = JSON.stringify(description ?? '');
  return `import { H1, Stack, Text } from "cursor/canvas";

export default function TaskCanvas() {
  return (
    <Stack gap={16}>
      <H1>${title.replace(/[<>{}]/g, '')}</H1>
      {${text} && <Text tone="secondary">{${text}}</Text>}
    </Stack>
  );
}
`;
}
