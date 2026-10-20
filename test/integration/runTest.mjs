// VS Code를 내려받아 확장 프로그램을 실제로 불러와 본다. `npm run test:integration`
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

// VS Code 안의 터미널에서 실행하면 상속되는 값. 남아 있으면 Electron이 node로 뜬다.
delete process.env.ELECTRON_RUN_AS_NODE;

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspace = mkdtempSync(path.join(os.tmpdir(), 'agent-board-it-'));
execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: workspace });
writeFileSync(path.join(workspace, 'README.md'), '# it\n');
// 스키마 1 보드: 열면 2로 마이그레이션되는지 확인한다 (TASK-2 CD-1).
mkdirSync(path.join(workspace, '.agent-board'), { recursive: true });
writeFileSync(
  path.join(workspace, '.agent-board', 'board.json'),
  JSON.stringify({ schemaVersion: 1, sharedDocs: [], settings: { maxReviewIterations: 3, stopTimeoutSec: 10 } }),
);

await runTests({
  version: process.env.VSCODE_VERSION ?? 'stable',
  extensionDevelopmentPath: root,
  extensionTestsPath: path.join(root, 'test/integration/suite/index.cjs'),
  launchArgs: [workspace, '--disable-extensions', '--locale=en'],
});
