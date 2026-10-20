// 카드의 에이전트 칩을 누르면 그 세션을 연다.
// 도구 확장 프로그램의 진입점은 공개 API가 아니라서 도구 업데이트로 바뀔 수 있다. 실패하면 터미널에서 CLI로 이어 연다.

import * as vscode from 'vscode';
import type { ToolId } from '../core/types';

/** 이 창의 도구 채팅 화면에서 세션을 연다. 열 방법이 없으면 false. */
export async function openInToolUi(tool: ToolId, sessionId: string): Promise<boolean> {
  const commands = new Set(await vscode.commands.getCommands(true));
  try {
    switch (tool) {
      case 'claude':
        // Claude Code 확장 프로그램의 `/open?session=` URI 처리와 같은 명령
        if (!commands.has('claude-vscode.primaryEditor.open')) return false;
        await vscode.commands.executeCommand('claude-vscode.primaryEditor.open', sessionId);
        return true;
      case 'codex':
        // Codex 확장 프로그램(openai.chatgpt)의 대화 편집기
        if (!vscode.extensions.getExtension('openai.chatgpt')) return false;
        await vscode.commands.executeCommand(
          'vscode.openWith',
          vscode.Uri.from({ scheme: 'openai-codex', authority: 'route', path: `/local/${sessionId}` }),
          'chatgpt.conversationEditor',
          { preview: false },
        );
        return true;
      case 'cursor':
        // Cursor 채팅(composer). Hook의 conversation_id가 composer ID다.
        if (!commands.has('composer.openComposer')) return false;
        await vscode.commands.executeCommand('composer.openComposer', sessionId);
        return true;
    }
  } catch {
    return false;
  }
}

/** 터미널에서 CLI 세션을 이어 연다. */
export function resumeInTerminal(tool: ToolId, binary: string, sessionId: string, cwd: string): void {
  const args = tool === 'codex' ? ['resume', sessionId] : ['--resume', sessionId];
  const terminal = vscode.window.createTerminal({ name: `${tool} ${sessionId.slice(0, 8)}`, cwd });
  terminal.show();
  terminal.sendText([binary, ...args].map(shellQuote).join(' '));
}

function shellQuote(s: string): string {
  return /^[\w./:@=-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`;
}
