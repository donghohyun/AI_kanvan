// Cursor CLI 어댑터. `agent -p --output-format stream-json`과 `.cursor/hooks.json` Hook을 다룬다.
// 읽기 전용 모드와 세션 목록 저장 위치는 문서로 보장되지 않아 지원하지 않는 것으로 선언한다.

import { obj, parseJsonLine, splitVerification, str, type Adapter } from './types';

export const cursorAdapter: Adapter = {
  id: 'cursor',
  binaries: ['cursor-agent', 'agent'],
  capabilities: { run: true, stop: true, resume: true, sessions: false, hooks: true, readOnly: false },

  buildLaunch(opts) {
    const args = ['-p', '--output-format', 'stream-json', '--workspace', opts.cwd, '--trust'];
    if (opts.resumeSessionId) args.push('--resume', opts.resumeSessionId);
    if (opts.readOnly) args.push('--mode', 'plan');
    if (opts.options?.model) args.push('--model', opts.options.model);
    if (opts.options?.force === 'true') args.push('--force');
    args.push(opts.prompt);
    return { args };
  },

  parseStreamLine(line) {
    const e = parseJsonLine(line);
    if (!e) return [];
    const sessionId = str(e.session_id);
    if (e.type === 'system' && e.subtype === 'init') return [{ type: 'run.started', sessionId }];
    if (e.type === 'tool_call' && e.subtype === 'completed') {
      const call = obj(e.tool_call);
      const write = obj(call.writeToolCall ?? call.editToolCall);
      const file = str(obj(write.args).path) ?? str(obj(obj(write.result).success).path);
      return file ? [{ type: 'file.changed', sessionId, payload: { changes: [file] } }] : [];
    }
    if (e.type === 'result') {
      if (e.is_error) return [{ type: 'run.failed', sessionId, payload: { error: str(e.result) ?? 'error' } }];
      return [{ type: 'response.completed', sessionId, payload: splitVerification(str(e.result)) }];
    }
    return [];
  },

  parseHook(input) {
    const e = obj(input);
    const sessionId = str(e.conversation_id) ?? str(e.session_id);
    const roots = Array.isArray(e.workspace_roots) ? e.workspace_roots : [];
    const base = { cwd: str(roots[0]), transcriptPath: str(e.transcript_path) };
    switch (e.hook_event_name) {
      case 'sessionStart':
        return [{ type: 'run.started', sessionId, payload: base }];
      case 'beforeSubmitPrompt':
        return [{ type: 'turn.started', sessionId, payload: { ...base, prompt: str(e.prompt) } }];
      case 'afterFileEdit': {
        const file = str(e.file_path);
        return [{ type: 'file.changed', sessionId, payload: { ...base, changes: file ? [file] : [] } }];
      }
      case 'stop':
        if (e.status === 'aborted') return [{ type: 'run.stopped', sessionId, payload: base }];
        if (e.status === 'error') return [{ type: 'run.failed', sessionId, payload: { ...base, error: 'error' } }];
        return [{ type: 'response.completed', sessionId, payload: { ...base, idle: true } }];
      case 'sessionEnd':
        return [{ type: 'run.ended', sessionId, payload: base }];
      default:
        return [];
    }
  },

  async listSessions() {
    return [];
  },

  async transcriptPath() {
    return undefined;
  },
};
