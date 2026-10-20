// 카드 판단용 짧은 CLI 호출 (E-10). 도구 없이 한 번 응답만 받는다.
// 보드가 띄운 세션이 다시 카드로 만들어지지 않도록 AGENT_BOARD_INTERNAL=1을 넘기고 임시 폴더에서 실행한다.

import { execFile } from 'node:child_process';
import * as os from 'node:os';
import { obj, parseJsonLine, str } from '../adapters/types';
import { CLASSIFIER_SYSTEM } from './cardMatcher';
import type { ToolId } from '../core/types';
import { envWithBinary } from './tools';

const TIMEOUT_MS = 90_000;

/** Claude는 규칙을 시스템 프롬프트로 받는다. 그 외 도구는 규칙과 내용을 이어서 보낸다. */
export function classifierArgs(tool: ToolId, prompt: string, cwd: string): string[] {
  const combined = `${CLASSIFIER_SYSTEM}\n\n${prompt}`;
  switch (tool) {
    case 'claude':
      return [
        '-p', prompt, '--system-prompt', CLASSIFIER_SYSTEM, '--output-format', 'json', '--model', 'haiku',
        '--tools', '', '--no-session-persistence', '--safe-mode',
      ];
    case 'codex':
      return ['exec', '--json', '-s', 'read-only', '--skip-git-repo-check', '--ephemeral', '-C', cwd, combined];
    case 'cursor':
      return ['-p', '--output-format', 'json', '--trust', '--workspace', cwd, combined];
  }
}

/** CLI 출력에서 최종 응답 텍스트를 꺼낸다. */
export function classifierText(tool: ToolId, stdout: string): string | undefined {
  if (tool === 'codex') {
    let last: string | undefined;
    for (const line of stdout.split('\n')) {
      const e = parseJsonLine(line);
      const item = obj(e?.item);
      if (e?.type === 'item.completed' && item.type === 'agent_message') last = str(item.text) ?? last;
    }
    return last;
  }
  const e = parseJsonLine(stdout.trim().split('\n').at(-1) ?? '');
  return e && !e.is_error ? str(e.result) : undefined;
}

export function runClassifier(tool: ToolId, binary: string, prompt: string): Promise<string | undefined> {
  const cwd = os.tmpdir();
  return new Promise((resolve) => {
    const child = execFile(
      binary,
      classifierArgs(tool, prompt, cwd),
      { cwd, env: envWithBinary(binary, { AGENT_BOARD_INTERNAL: '1' }), timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => resolve(err ? undefined : classifierText(tool, stdout)),
    );
    // codex exec는 stdin이 열려 있으면 추가 입력을 기다린다.
    child.stdin?.end();
  });
}
