#!/usr/bin/env node
// Claude Code headless 출력을 흉내 내는 가짜 CLI.
// FAKE_STATE 폴더의 verdicts.json(리뷰 결과 대기열)과 mode 파일로 동작을 정한다.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('9.9.9 (Fake)');
  process.exit(0);
}
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const prompt = opt('-p');
const session = opt('--resume') ?? opt('--session-id') ?? randomUUID();
const readOnly = args.includes('--disallowed-tools');
const state = process.env.FAKE_STATE;
const mode = existsSync(path.join(state, 'mode')) ? readFileSync(path.join(state, 'mode'), 'utf8').trim() : 'normal';
const emit = (v) => console.log(JSON.stringify(v));

writeFileSync(path.join(state, `call-${Date.now()}-${process.pid}.json`), JSON.stringify({ args, cwd: process.cwd(), env: { run: process.env.AGENT_BOARD_RUN_ID, card: process.env.AGENT_BOARD_CARD_ID, internal: process.env.AGENT_BOARD_INTERNAL } }));

// 카드 판단 호출: classify.json의 결과를 돌려준다.
if (args.includes('--no-session-persistence')) {
  const file = path.join(state, 'classify.json');
  const result = existsSync(file) ? readFileSync(file, 'utf8') : '{"cardId": null, "title": "Fake", "intent": "fake", "spec": [], "plan": []}';
  console.log(JSON.stringify({ type: 'result', is_error: false, result: `Here you go:\n\`\`\`json\n${result}\n\`\`\`` }));
  process.exit(0);
}
emit({ type: 'system', subtype: 'init', session_id: session });

if (mode === 'hang') {
  setInterval(() => {}, 1000);
} else if (mode === 'slowstop') {
  // 중단 신호를 받고 3초 뒤에야 끝난다 (중단 시간 초과 후 실제 종료).
  const later = () => setTimeout(() => process.exit(130), 3000);
  process.once('SIGINT', later);
  process.on('SIGTERM', () => undefined);
  setInterval(() => {}, 1000);
} else if (mode === 'fail') {
  console.error('fake failure');
  process.exit(2);
} else if (readOnly) {
  const file = path.join(state, 'verdicts.json');
  const queue = JSON.parse(readFileSync(file, 'utf8'));
  const verdict = queue.shift() ?? { verdict: 'pass', findings: [] };
  writeFileSync(file, JSON.stringify(queue));
  emit({ type: 'result', subtype: 'success', is_error: false, session_id: session, result: `Reviewed.\n\`\`\`json\n${JSON.stringify(verdict)}\n\`\`\`` });
} else {
  const n = Date.now();
  writeFileSync(path.join(process.cwd(), `impl-${n}.txt`), prompt.slice(0, 40));
  emit({ type: 'assistant', session_id: session, message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: `impl-${n}.txt` } }] } });
  const planPath = /- plan: (.+)$/m.exec(prompt)?.[1];
  if (planPath && existsSync(planPath)) {
    const plan = readFileSync(planPath, 'utf8');
    writeFileSync(planPath, plan.replace('- [ ]', '- [x]'));
  }
  emit({ type: 'result', subtype: 'success', is_error: false, session_id: session, result: 'Implemented.\n## Verification\nfake tests passed' });
}
