// 에이전트 도구의 Hook에서 실행되는 스크립트. stdin JSON을 보드의 inbox 폴더에 파일로 남긴다.
// 네트워크를 쓰지 않으므로 외부에서 접근할 수 없다 (N-3). 확장 프로그램이 꺼져 있어도 이벤트가 보존된다.
// 보드가 이 세션에 남긴 알림(outbox)이 있으면, 맥락을 넣을 수 있는 이벤트의 출력으로 전달한다 (E-12).
// 사용법: hook.js <tool> <inbox 폴더>

import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { outboxFile } from '../runner/outbox';

const [tool, inbox] = process.argv.slice(2);

/** 도구별로 맥락을 넣을 수 있는 이벤트와 출력 형식 */
const CONTEXT_EVENTS: Record<string, string[]> = {
  claude: ['UserPromptSubmit', 'PostToolUse', 'SessionStart'],
  codex: ['UserPromptSubmit', 'PostToolUse', 'SessionStart'],
  cursor: ['postToolUse', 'sessionStart'],
};

function sessionIdOf(input: Record<string, unknown>): string | undefined {
  const id = input.session_id ?? input.conversation_id;
  return typeof id === 'string' && id ? id : undefined;
}

function deliver(input: Record<string, unknown>): void {
  const event = String(input.hook_event_name ?? '');
  const sessionId = sessionIdOf(input);
  if (!tool || !sessionId || !CONTEXT_EVENTS[tool]?.includes(event)) return;
  const file = outboxFile(path.join(path.dirname(inbox!), 'outbox'), tool, sessionId);
  let messages: string[];
  try {
    messages = (JSON.parse(readFileSync(file, 'utf8')) as { messages: string[] }).messages;
    rmSync(file, { force: true });
  } catch {
    return;
  }
  if (!messages.length) return;
  const text = messages.join('\n\n');
  const output = tool === 'cursor' ? { additional_context: text } : { hookSpecificOutput: { hookEventName: event, additionalContext: text } };
  process.stdout.write(JSON.stringify(output));
}

const chunks: Buffer[] = [];
process.stdin.on('data', (c: Buffer) => chunks.push(c));
process.stdin.on('end', () => {
  try {
    if (!tool || !inbox) return;
    const text = Buffer.concat(chunks).toString('utf8');
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return;
    }
    const receivedAt = new Date().toISOString();
    const name = `${Date.now().toString().padStart(15, '0')}-${process.hrtime.bigint()}-${randomBytes(4).toString('hex')}`;
    mkdirSync(inbox, { recursive: true });
    const tmp = path.join(inbox, `.${name}.tmp`);
    writeFileSync(
      tmp,
      JSON.stringify({
        tool,
        receivedAt,
        runId: process.env.AGENT_BOARD_RUN_ID,
        cardId: process.env.AGENT_BOARD_CARD_ID,
        // 보드가 판단용으로 띄운 세션은 카드로 만들지 않는다.
        internal: process.env.AGENT_BOARD_INTERNAL === '1' || undefined,
        input,
      }),
    );
    renameSync(tmp, path.join(inbox, `${name}.json`));
    deliver(input);
  } catch {
    // Hook 실패가 에이전트 실행을 막지 않게 한다.
  }
});
