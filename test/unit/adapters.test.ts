import { describe, expect, it } from 'vitest';
import { claudeAdapter, claudeProjectDir } from '../../src/adapters/claude';
import { codexAdapter } from '../../src/adapters/codex';
import { cursorAdapter } from '../../src/adapters/cursor';
import { splitVerification } from '../../src/adapters/types';

const line = (v: unknown) => JSON.stringify(v);

describe('claude', () => {
  it('builds headless commands for new, resumed and read-only runs', () => {
    const base = { prompt: 'do it', cwd: '/w', readOnly: false, addDirs: ['/repo/.agent-board/tasks/TASK-1'] };
    const fresh = claudeAdapter.buildLaunch({ ...base, newSessionId: 'uuid-1' });
    expect(fresh.presetSessionId).toBe('uuid-1');
    expect(fresh.args).toEqual([
      '-p', 'do it', '--output-format', 'stream-json', '--verbose',
      '--session-id', 'uuid-1', '--permission-mode', 'acceptEdits', '--add-dir', '/repo/.agent-board/tasks/TASK-1',
    ]);
    const resumed = claudeAdapter.buildLaunch({ ...base, resumeSessionId: 'S', newSessionId: 'ignored' });
    expect(resumed.args).toContain('--resume');
    expect(resumed.presetSessionId).toBeUndefined();
    const review = claudeAdapter.buildLaunch({ ...base, readOnly: true });
    expect(review.args).toEqual(expect.arrayContaining(['--disallowed-tools', 'Edit', 'Write', '--allowed-tools', 'Bash(git diff *)']));
    expect(review.args).not.toContain('acceptEdits');
  });

  it('parses stream-json events', () => {
    expect(claudeAdapter.parseStreamLine(line({ type: 'system', subtype: 'init', session_id: 'S' }))).toEqual([
      { type: 'run.started', sessionId: 'S' },
    ]);
    expect(
      claudeAdapter.parseStreamLine(
        line({ type: 'assistant', session_id: 'S', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } }, { type: 'text', text: 'x' }] } }),
      ),
    ).toEqual([{ type: 'file.changed', sessionId: 'S', payload: { changes: ['a.ts'] } }]);
    const done = claudeAdapter.parseStreamLine(line({ type: 'result', subtype: 'success', is_error: false, result: 'Did it\n## Verification\nnpm test ok', session_id: 'S' }));
    expect(done).toEqual([{ type: 'response.completed', sessionId: 'S', payload: { summary: 'Did it\n## Verification\nnpm test ok', verification: 'npm test ok' } }]);
    expect(claudeAdapter.parseStreamLine(line({ type: 'result', is_error: true, subtype: 'error_max_turns' }))[0]!.type).toBe('run.failed');
    const denied = claudeAdapter.parseStreamLine(line({ type: 'result', is_error: false, result: 'r', permission_denials: [{ tool_name: 'Bash' }] }));
    expect(denied).toEqual([{ type: 'response.completed', sessionId: undefined, payload: { summary: 'r', reason: 'permission denied: Bash' } }]);
    expect(claudeAdapter.parseStreamLine('not json')).toEqual([]);
  });

  it('parses hook input', () => {
    const hook = (name: string, extra = {}) => claudeAdapter.parseHook({ hook_event_name: name, session_id: 'S', cwd: '/w', transcript_path: '/t', ...extra });
    expect(hook('SessionStart')[0]).toMatchObject({ type: 'run.started', sessionId: 'S', payload: { cwd: '/w', transcriptPath: '/t' } });
    expect(hook('Notification', { notification_type: 'permission_prompt' })[0]!.type).toBe('input.required');
    expect(hook('Stop', { last_assistant_message: 'ok' })[0]).toMatchObject({ type: 'response.completed', payload: { idle: true, summary: 'ok' } });
    expect(hook('PostToolUse', { tool_name: 'Read' })).toEqual([]);
    expect(hook('SessionEnd')[0]!.type).toBe('run.ended');
  });

  it('maps cwd to the projects folder', () => {
    expect(claudeProjectDir('/Users/me/my_repo.x', '/h')).toBe('/h/.claude/projects/-Users-me-my-repo-x');
  });
});

describe('codex', () => {
  it('builds exec and resume commands', () => {
    const base = { prompt: 'p', cwd: '/w', readOnly: false, addDirs: ['/d'] };
    expect(codexAdapter.buildLaunch(base).args).toEqual(['exec', '--json', '-C', '/w', '-s', 'workspace-write', '--add-dir', '/d', 'p']);
    expect(codexAdapter.buildLaunch({ ...base, readOnly: true }).args).toEqual(['exec', '--json', '-C', '/w', '-s', 'read-only', 'p']);
    expect(codexAdapter.buildLaunch({ ...base, resumeSessionId: 'T' }).args).toEqual([
      'exec', 'resume', 'T', '--json', '-c', 'sandbox_mode="workspace-write"', 'p',
    ]);
  });

  it('parses JSONL events', () => {
    expect(codexAdapter.parseStreamLine(line({ type: 'thread.started', thread_id: 'T' }))).toEqual([{ type: 'run.started', sessionId: 'T' }]);
    expect(
      codexAdapter.parseStreamLine(line({ type: 'item.completed', item: { type: 'file_change', changes: [{ path: 'a.ts', kind: 'update' }] } })),
    ).toEqual([{ type: 'file.changed', payload: { changes: ['a.ts'] } }]);
    expect(codexAdapter.parseStreamLine(line({ type: 'item.completed', item: { type: 'agent_message', text: 'hi' } }))).toEqual([
      { type: 'response.completed', payload: { summary: 'hi' } },
    ]);
    expect(codexAdapter.parseStreamLine(line({ type: 'turn.failed', error: { message: 'boom' } }))).toEqual([
      { type: 'run.failed', payload: { error: 'boom' } },
    ]);
    expect(codexAdapter.parseStreamLine(line({ type: 'turn.completed', usage: {} }))).toEqual([]);
  });

  it('parses hooks', () => {
    expect(codexAdapter.parseHook({ hook_event_name: 'Interrupt', session_id: 'T', cwd: '/w' })[0]!.type).toBe('run.stopped');
    expect(codexAdapter.parseHook({ hook_event_name: 'PermissionRequest', session_id: 'T', tool_name: 'shell' })[0]).toMatchObject({
      type: 'input.required',
      payload: { reason: 'shell' },
    });
  });
});

describe('cursor', () => {
  it('declares unsupported features (E-4)', () => {
    expect(cursorAdapter.capabilities.readOnly).toBe(false);
    expect(cursorAdapter.capabilities.sessions).toBe(false);
  });

  it('parses stream-json and hooks', () => {
    expect(cursorAdapter.parseStreamLine(line({ type: 'system', subtype: 'init', session_id: 'C' }))[0]).toEqual({ type: 'run.started', sessionId: 'C' });
    expect(
      cursorAdapter.parseStreamLine(line({ type: 'tool_call', subtype: 'completed', tool_call: { writeToolCall: { args: { path: 'b.ts' } } } })),
    ).toEqual([{ type: 'file.changed', payload: { changes: ['b.ts'] } }]);
    expect(cursorAdapter.parseStreamLine(line({ type: 'result', is_error: false, result: 'ok', session_id: 'C' }))[0]!.type).toBe('response.completed');
    expect(cursorAdapter.parseHook({ hook_event_name: 'stop', status: 'aborted', conversation_id: 'C', workspace_roots: ['/w'] })[0]).toMatchObject({
      type: 'run.stopped',
      sessionId: 'C',
      payload: { cwd: '/w' },
    });
  });
});

describe('splitVerification', () => {
  it('extracts the verification section until the next heading', () => {
    expect(splitVerification('a\n## 검증\n- ok\n## Next\nz').verification).toBe('- ok');
    expect(splitVerification('plain').verification).toBeUndefined();
  });
});
