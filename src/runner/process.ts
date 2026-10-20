// 에이전트 프로세스 실행·중단·생존 확인.

import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface AgentProcess {
  pid: number;
  startedAt: string;
  /** SIGINT 후 기다렸다가 SIGTERM. 시간 안에 끝나지 않으면 'timeout' (R-2). */
  stop(timeoutMs: number): Promise<'exited' | 'timeout'>;
  exited: Promise<{ code: number | null; signal: NodeJS.Signals | null; stderrTail: string }>;
}

export interface SpawnOptions {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  /** stdout 원문을 저장할 파일 (세션 원문 대체) */
  logFile: string;
  onLine: (line: string, seq: number) => void;
}

const STDERR_TAIL = 4000;

export async function spawnAgent(opts: SpawnOptions): Promise<AgentProcess> {
  await fs.mkdir(path.dirname(opts.logFile), { recursive: true });
  const log = createWriteStream(opts.logFile, { flags: 'a' });
  const child: ChildProcess = spawn(opts.command, opts.args, { cwd: opts.cwd, env: opts.env, stdio: ['ignore', 'pipe', 'pipe'] });

  await new Promise<void>((resolve, reject) => {
    child.once('spawn', () => resolve());
    child.once('error', reject);
  });

  let seq = 0;
  let buffer = '';
  child.stdout!.setEncoding('utf8');
  child.stdout!.on('data', (chunk: string) => {
    log.write(chunk);
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (line.trim()) opts.onLine(line, ++seq);
    }
  });
  let stderr = '';
  child.stderr!.setEncoding('utf8');
  child.stderr!.on('data', (chunk: string) => {
    stderr = (stderr + chunk).slice(-STDERR_TAIL);
  });

  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stderrTail: string }>((resolve) => {
    child.once('close', (code, signal) => {
      if (buffer.trim()) opts.onLine(buffer, ++seq);
      log.end();
      resolve({ code, signal, stderrTail: stderr.trim() });
    });
  });

  return {
    pid: child.pid!,
    startedAt: new Date().toISOString(),
    exited,
    async stop(timeoutMs) {
      if (child.exitCode !== null || child.signalCode !== null) return 'exited';
      child.kill('SIGINT');
      const wait = (ms: number) =>
        Promise.race([exited.then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), ms))]);
      if (await wait(timeoutMs / 2)) return 'exited';
      child.kill('SIGTERM');
      return (await wait(timeoutMs / 2)) ? 'exited' : 'timeout';
    },
  };
}

function psStartTime(pid: number): Promise<Date | undefined> {
  return new Promise((resolve) => {
    // 로캘에 따라 날짜 형식이 바뀌므로 C 로캘로 실행한다.
    execFile('ps', ['-o', 'lstart=', '-p', String(pid)], { env: { ...process.env, LC_ALL: 'C' } }, (err, stdout) => {
      const d = err ? undefined : new Date(stdout.trim());
      resolve(d && !Number.isNaN(d.getTime()) ? d : undefined);
    });
  });
}

/** V-1: PID가 살아 있고 시작 시각이 기록과 맞는지 확인한다. PID 재사용을 걸러낸다. */
export async function isProcessAlive(pid: number, startedAt: string): Promise<boolean> {
  try {
    process.kill(pid, 0);
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
  const actual = await psStartTime(pid);
  if (!actual) return true;
  return Math.abs(actual.getTime() - Date.parse(startedAt)) < 5000;
}
