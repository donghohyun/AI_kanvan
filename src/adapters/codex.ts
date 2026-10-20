// Codex CLI 어댑터. `codex exec --json` JSONL과 Hook stdin JSON을 다룬다.

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { obj, parseJsonLine, splitVerification, str, type Adapter, type SessionInfo } from './types';

const SESSION_SCAN_LIMIT = 400;

function sessionsRoot(home = os.homedir()): string {
  return path.join(home, '.codex', 'sessions');
}

/** 최신 rollout 파일부터 거슬러 올라가며 나열한다. */
async function recentRollouts(limit: number): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number): Promise<void> => {
    if (out.length >= limit) return;
    let entries: string[];
    try {
      entries = (await fs.readdir(dir)).sort().reverse();
    } catch {
      return;
    }
    for (const name of entries) {
      if (out.length >= limit) return;
      const full = path.join(dir, name);
      if (depth < 3) await walk(full, depth + 1);
      else if (name.startsWith('rollout-') && name.endsWith('.jsonl')) out.push(full);
    }
  };
  await walk(sessionsRoot(), 0);
  return out;
}

async function readFirstLine(file: string): Promise<string | undefined> {
  const handle = await fs.open(file, 'r');
  try {
    const chunks: Buffer[] = [];
    const buf = Buffer.alloc(64 * 1024);
    for (let pos = 0; pos < 4 * 1024 * 1024; ) {
      const { bytesRead } = await handle.read(buf, 0, buf.length, pos);
      if (bytesRead === 0) break;
      const nl = buf.subarray(0, bytesRead).indexOf(10);
      if (nl >= 0) {
        chunks.push(Buffer.from(buf.subarray(0, nl)));
        break;
      }
      chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
      pos += bytesRead;
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    await handle.close();
  }
}

export const codexAdapter: Adapter = {
  id: 'codex',
  binaries: ['codex'],
  capabilities: { run: true, stop: true, resume: true, sessions: true, hooks: true, readOnly: true },

  buildLaunch(opts) {
    const sandbox = opts.readOnly ? 'read-only' : (opts.options?.sandbox ?? 'workspace-write');
    if (opts.resumeSessionId) {
      // resume 하위 명령은 -s/-C를 받지 않아 설정 값으로 넘긴다.
      const args = ['exec', 'resume', opts.resumeSessionId, '--json', '-c', `sandbox_mode="${sandbox}"`];
      if (opts.options?.model) args.push('-m', opts.options.model);
      args.push(opts.prompt);
      return { args };
    }
    const args = ['exec', '--json', '-C', opts.cwd, '-s', sandbox];
    if (!opts.readOnly) for (const dir of opts.addDirs) args.push('--add-dir', dir);
    if (opts.options?.model) args.push('-m', opts.options.model);
    args.push(opts.prompt);
    return { args };
  },

  parseStreamLine(line) {
    const e = parseJsonLine(line);
    if (!e) return [];
    switch (e.type) {
      case 'thread.started':
        return [{ type: 'run.started', sessionId: str(e.thread_id) }];
      case 'item.completed': {
        const item = obj(e.item);
        if (item.type === 'file_change') {
          const changes = (Array.isArray(item.changes) ? item.changes : []).map((c) => str(obj(c).path)).filter((p): p is string => !!p);
          return changes.length ? [{ type: 'file.changed', payload: { changes } }] : [];
        }
        if (item.type === 'agent_message') return [{ type: 'response.completed', payload: splitVerification(str(item.text)) }];
        return [];
      }
      case 'turn.failed':
        return [{ type: 'run.failed', payload: { error: str(obj(e.error).message) ?? 'turn failed' } }];
      case 'error':
        return [{ type: 'run.failed', payload: { error: str(e.message) ?? 'error' } }];
      default:
        return [];
    }
  },

  parseHook(input) {
    const e = obj(input);
    const sessionId = str(e.session_id);
    const base = { cwd: str(e.cwd), transcriptPath: str(e.transcript_path) };
    switch (e.hook_event_name) {
      case 'SessionStart':
        return [{ type: 'run.started', sessionId, payload: base }];
      case 'UserPromptSubmit':
        return [{ type: 'turn.started', sessionId, payload: { ...base, prompt: str(e.prompt) } }];
      case 'PostToolUse':
        return [{ type: 'file.changed', sessionId, payload: base }];
      case 'PermissionRequest':
        return [{ type: 'input.required', sessionId, payload: { ...base, reason: str(e.tool_name) } }];
      case 'Stop':
        return [{ type: 'response.completed', sessionId, payload: { ...base, ...splitVerification(str(e.last_assistant_message)), idle: true } }];
      case 'Interrupt':
        return [{ type: 'run.stopped', sessionId, payload: base }];
      case 'SessionEnd':
        return [{ type: 'run.ended', sessionId, payload: base }];
      default:
        return [];
    }
  },

  async listSessions(cwd) {
    const out: SessionInfo[] = [];
    for (const file of await recentRollouts(SESSION_SCAN_LIMIT)) {
      const meta = parseJsonLine((await readFirstLine(file).catch(() => undefined)) ?? '');
      const payload = obj(meta?.payload);
      if (meta?.type !== 'session_meta' || payload.cwd !== cwd) continue;
      const id = str(payload.id) ?? str(payload.session_id);
      if (!id) continue;
      const stat = await fs.stat(file);
      out.push({ id, updatedAt: stat.mtime.toISOString() });
    }
    return out;
  },

  async transcriptPath(_cwd, sessionId) {
    return (await recentRollouts(SESSION_SCAN_LIMIT)).find((f) => f.endsWith(`-${sessionId}.jsonl`));
  },
};
