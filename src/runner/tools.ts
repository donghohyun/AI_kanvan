// 도구 CLI 찾기와 버전 확인 (T-3).

import { execFile } from 'node:child_process';
import { promises as fs, constants } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Adapter } from '../adapters/types';

/** VS Code가 GUI에서 실행되면 셸 PATH를 물려받지 못할 수 있어 흔한 설치 위치를 함께 찾는다. */
function searchDirs(): string[] {
  const home = os.homedir();
  const fromPath = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return [
    ...fromPath,
    path.join(home, '.local', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.cursor', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ];
}

async function isExecutable(file: string): Promise<boolean> {
  try {
    await fs.access(file, constants.X_OK);
    return (await fs.stat(file)).isFile();
  } catch {
    return false;
  }
}

export async function findBinary(adapter: Adapter, override?: string): Promise<string | undefined> {
  if (override) return (await isExecutable(override)) ? override : undefined;
  return findExecutable(adapter.binaries);
}

export async function findExecutable(names: string[]): Promise<string | undefined> {
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : [''];
  for (const name of names) {
    for (const dir of searchDirs()) {
      for (const ext of exts) {
        const file = path.join(dir, name + ext);
        if (await isExecutable(file)) return file;
      }
    }
  }
  return undefined;
}

export function readVersion(binary: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(binary, ['--version'], { timeout: 5000 }, (err, stdout) => resolve(err ? undefined : stdout.trim().split('\n')[0]));
  });
}

/**
 * 실행할 때 찾은 CLI의 폴더를 PATH 앞에 둔다(도구가 node 등을 다시 찾을 수 있도록).
 * 확장 호스트의 ELECTRON_RUN_AS_NODE는 에이전트가 실행하는 Electron 앱을 망가뜨리므로 넘기지 않는다.
 */
export function envWithBinary(binary: string, extra: Record<string, string>): NodeJS.ProcessEnv {
  const dirs = [path.dirname(binary), ...searchDirs()];
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: [...new Set(dirs)].join(path.delimiter), ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
