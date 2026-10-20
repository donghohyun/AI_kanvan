import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

// 실제 에이전트 CLI를 호출한다(모델 사용량 발생). AGENT_BOARD_SMOKE=claude,codex 로 실행한다.
export default defineConfig({
  resolve: {
    alias: { vscode: path.resolve('test/stubs/vscode.ts') },
  },
  test: {
    include: ['test/smoke/**/*.test.ts'],
    testTimeout: 600_000,
  },
});
