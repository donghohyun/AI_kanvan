// Claude Code 어댑터. `claude -p --output-format stream-json`과 Hook stdin JSON을 다룬다.

import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathExists } from '../storage/fsutil';
import { obj, parseJsonLine, splitVerification, str, type Adapter, type SessionInfo } from './types';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const READ_ONLY_DISALLOWED = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
/** 리뷰어가 변경 내용을 볼 수 있도록 허용하는 읽기 전용 git 명령 */
const READ_ONLY_ALLOWED = ['Bash(git diff *)', 'Bash(git status)', 'Bash(git status *)', 'Bash(git log *)', 'Bash(git show *)'];

/** ~/.claude/projects/ 아래 폴더 이름: 영숫자 외 문자는 `-`로 바뀐다. */
export function claudeProjectDir(cwd: string, home = os.homedir()): string {
  return path.join(home, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
}

export const claudeAdapter: Adapter = {
  id: 'claude',
  binaries: ['claude'],
  capabilities: { run: true, stop: true, resume: true, sessions: true, hooks: true, readOnly: true },

  buildLaunch(opts) {
    const args = ['-p', opts.prompt, '--output-format', 'stream-json', '--verbose'];
    let presetSessionId: string | undefined;
    if (opts.resumeSessionId) {
      args.push('--resume', opts.resumeSessionId);
    } else if (opts.newSessionId) {
      args.push('--session-id', opts.newSessionId);
      presetSessionId = opts.newSessionId;
    }
    if (opts.readOnly) args.push('--disallowed-tools', ...READ_ONLY_DISALLOWED, '--allowed-tools', ...READ_ONLY_ALLOWED);
    else args.push('--permission-mode', opts.options?.permissionMode ?? 'acceptEdits');
    for (const dir of opts.addDirs) args.push('--add-dir', dir);
    if (opts.options?.model) args.push('--model', opts.options.model);
    return { args, presetSessionId };
  },

  parseStreamLine(line) {
    const e = parseJsonLine(line);
    if (!e) return [];
    const sessionId = str(e.session_id);
    if (e.type === 'system' && e.subtype === 'init') return [{ type: 'run.started', sessionId }];
    if (e.type === 'assistant') {
      const content = obj(e.message).content;
      const files = (Array.isArray(content) ? content : [])
        .map(obj)
        .filter((c) => c.type === 'tool_use' && EDIT_TOOLS.has(String(c.name)))
        .map((c) => str(obj(c.input).file_path) ?? str(obj(c.input).notebook_path))
        .filter((f): f is string => !!f);
      return files.length ? [{ type: 'file.changed', sessionId, payload: { changes: files } }] : [];
    }
    if (e.type === 'result') {
      if (e.is_error) return [{ type: 'run.failed', sessionId, payload: { error: str(e.result) ?? str(e.subtype) ?? 'error' } }];
      // headless 실행에서 거부된 도구는 요청이 아니라 에이전트가 건너뛴 것이므로 상세 정보로만 남긴다.
      const denials = Array.isArray(e.permission_denials) ? e.permission_denials : [];
      const denied = [...new Set(denials.map((d) => str(obj(d).tool_name)).filter(Boolean))];
      const reason = denied.length ? `permission denied: ${denied.join(', ')}` : undefined;
      return [{ type: 'response.completed', sessionId, payload: { ...splitVerification(str(e.result)), ...(reason ? { reason } : {}) } }];
    }
    return [];
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
      case 'PostToolUse': {
        if (!EDIT_TOOLS.has(String(e.tool_name))) return [];
        const file = str(obj(e.tool_input).file_path);
        return [{ type: 'file.changed', sessionId, payload: { ...base, changes: file ? [file] : [] } }];
      }
      case 'Notification':
      case 'PermissionRequest':
        return [{ type: 'input.required', sessionId, payload: { ...base, reason: str(e.message) ?? str(e.notification_type) } }];
      case 'Stop':
        return [{ type: 'response.completed', sessionId, payload: { ...base, ...splitVerification(str(e.last_assistant_message)), idle: true } }];
      case 'StopFailure':
        return [{ type: 'run.failed', sessionId, payload: { ...base, error: str(e.error) ?? 'stop failure' } }];
      case 'SessionEnd':
        return [{ type: 'run.ended', sessionId, payload: base }];
      default:
        return [];
    }
  },

  async listSessions(cwd) {
    const dir = claudeProjectDir(cwd);
    let names: string[];
    try {
      names = (await fs.readdir(dir)).filter((n) => n.endsWith('.jsonl'));
    } catch {
      return [];
    }
    const sessions = await Promise.all(
      names.map(async (n): Promise<SessionInfo> => {
        const stat = await fs.stat(path.join(dir, n));
        return { id: n.slice(0, -'.jsonl'.length), updatedAt: stat.mtime.toISOString() };
      }),
    );
    return sessions.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  },

  async transcriptPath(cwd, sessionId) {
    const file = path.join(claudeProjectDir(cwd), `${sessionId}.jsonl`);
    return (await pathExists(file)) ? file : undefined;
  },
};
