// 확장 프로그램 호스트 안에서 실행된다. 실패하면 예외를 던진다.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vscode = require('vscode');

exports.run = async function run() {
  try {
    await suite();
  } catch (err) {
    // 확장 호스트의 예외는 로그에 남지 않으므로 직접 출력한다.
    console.error('integration: FAILED', err && err.stack ? err.stack : err);
    throw err;
  }
};

async function suite() {
  const ext = vscode.extensions.getExtension('agent-board.agent-board');
  assert.ok(ext, 'extension is installed');
  const api = await ext.activate();
  const commands = await vscode.commands.getCommands(true);
  for (const c of ['agentBoard.open', 'agentBoard.createCard', 'agentBoard.installHooks', 'agentBoard.detectTools']) {
    assert.ok(commands.includes(c), `${c} is registered`);
  }

  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  await vscode.commands.executeCommand('agentBoard.open');
  const card = await api.controller.createCard('Integration card');
  assert.equal(card.id, 'TASK-1');
  assert.ok(fs.existsSync(path.join(root, '.agent-board/tasks/TASK-1/plan.md')));
  assert.match(fs.readFileSync(path.join(root, '.gitignore'), 'utf8'), /\.agent-board\/local\//);

  fs.writeFileSync(path.join(root, '.agent-board/tasks/TASK-1/plan.md'), '- [x] a\n- [ ] b\n');
  await api.controller.reload();
  assert.deepEqual(api.controller.loadedCards[0].progress, { done: 1, total: 2 });

  await api.controller.move('TASK-1', 'in_progress');
  await api.controller.reload();
  assert.equal(api.controller.getCard('TASK-1').status, 'in_progress');
  assert.equal(api.controller.getCard('TASK-1').statusVersion, 1);
  // TASK-2: 스키마 1 → 2 마이그레이션과 구분 추가·집계
  const migrated = JSON.parse(fs.readFileSync(path.join(root, '.agent-board/board.json'), 'utf8'));
  assert.equal(migrated.schemaVersion, 2);
  assert.deepEqual(migrated.categories.map((c) => c.tag), ['BE', 'FE', 'Infra', 'ML']);
  await api.controller.handle({ type: 'addCategory', tag: 'Data', name: '데이터', color: 'green' });
  fs.writeFileSync(path.join(root, '.agent-board/tasks/TASK-1/plan.md'), '## [Data] 적재\n- [x] a\n- [ ] b\n');
  await api.controller.reload();
  assert.deepEqual(api.controller.loadedCards[0].tags, { data: { done: 1, total: 2 } });
  assert.ok(api.controller.sharedDocs !== undefined);
  assert.equal(api.controller.enabledTools().length, 3);
  // TASK-3: canvas 변환·전달, 변경 시 다시 전달, 오류 전달, 상태 저장
  const posted = [];
  const originalPost = api.controller.post.bind(api.controller);
  api.controller.post = (msg) => {
    posted.push(msg);
    originalPost(msg);
  };
  const canvasFile = path.join(root, '.agent-board/tasks/TASK-1/canvas.tsx');
  fs.writeFileSync(canvasFile, 'import { H1 } from "cursor/canvas";\nexport default function A() { return <H1>v1</H1>; }\n');
  await api.controller.handle({ type: 'loadCanvas', dir: 'TASK-1' });
  const first = posted.filter((m) => m.type === 'canvas').at(-1).payload;
  assert.equal(first.exists, true);
  assert.equal(first.trusted, vscode.workspace.isTrusted);
  if (first.trusted) assert.match(first.code, /require\('cursor\/canvas'\)/);
  fs.writeFileSync(canvasFile, 'export default function A() {\n  return <div>\n  const = 1;\n}\n');
  await api.controller.reload();
  const broken = posted.filter((m) => m.type === 'canvas').at(-1).payload;
  if (broken.trusted) assert.match(broken.error, /line 3/);
  await api.controller.handle({ type: 'canvasState', dir: 'TASK-1', key: 'tab', value: 2 });
  const saved = JSON.parse(fs.readFileSync(path.join(root, '.agent-board/local/canvas-state/TASK-1.json'), 'utf8'));
  assert.deepEqual(saved, { tab: 2 });
  // 모든 카드는 canvas 스타일: canvas.tsx가 없으면 기본 문서용 작업 문서를 보낸다
  fs.rmSync(canvasFile);
  await api.controller.handle({ type: 'loadCanvas', dir: 'TASK-1' });
  const fallback = posted.filter((m) => m.type === 'canvas').at(-1).payload;
  assert.equal(fallback.exists, false);
  assert.match(fallback.docs.plan, /\[Data\]/);
  // 공용 문서 canvas
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs/api.canvas.tsx'), 'import { H1 } from "cursor/canvas";\nexport default function A() { return <H1>API</H1>; }\n');
  const board = JSON.parse(fs.readFileSync(path.join(root, '.agent-board/board.json'), 'utf8'));
  board.sharedDocs.push({ id: 'doc-9', name: 'API', category: 'api', path: 'docs/api.canvas.tsx' });
  fs.writeFileSync(path.join(root, '.agent-board/board.json'), JSON.stringify(board));
  await api.controller.reload();
  await api.controller.handle({ type: 'loadCanvas', dir: 'shared:doc-9' });
  const shared = posted.filter((m) => m.type === 'canvas').at(-1).payload;
  assert.equal(shared.kind, 'shared');
  if (shared.trusted) assert.match(shared.code, /cursor\/canvas/);
  console.log('integration: ok', 'trusted=' + vscode.workspace.isTrusted, 'code=' + Boolean(first.code), 'error=' + broken.error);
}
