import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { vscode: path.resolve('test/stubs/vscode.ts') },
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
  },
});
