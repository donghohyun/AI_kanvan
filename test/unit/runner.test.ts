import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localDate } from '../../src/core/board';
import type { AgentEvent } from '../../src/core/runs';
import { addToExclude, changesSince, codeRef, createWorktree, defaultWorkspace, docHistory, headCommit, isTracked } from '../../src/runner/git';
import { HOOK_MARKER, hookCommand, installHooks, mergeCursorHooks, mergeMatcherHooks } from '../../src/runner/hookInstall';
import { isProcessAlive, spawnAgent } from '../../src/runner/process';
import { parseReview } from '../../src/runner/prompt';
import { RunStore } from '../../src/runner/runStore';

let tmp: string;
beforeEach(async () => {
  tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-runner-')));
});
afterEach(async () => {
  await fs.rm(tmp, { recursive: true, force: true });
});

function gitInit(dir: string) {
  const run = (...args: string[]) => execFileSync('git', args, { cwd: dir });
  run('init', '-q', '-b', 'main');
  run('config', 'user.email', 't@example.com');
  run('config', 'user.name', 't');
  return run;
}

describe('git (W-1, A-3)', () => {
  it('creates a worktree and tracks code versions', async () => {
    const repo = path.join(tmp, 'repo');
    await fs.mkdir(repo);
    const run = gitInit(repo);
    await fs.writeFile(path.join(repo, 'a.txt'), 'a');
    run('add', '.');
    run('commit', '-qm', 'init');

    const ws = defaultWorkspace(repo, 'TASK-1');
    expect(ws).toEqual({ branch: 'task/TASK-1', worktree: '../repo-worktrees/TASK-1' });
    await createWorktree(repo, ws.worktree, ws.branch);
    const wt = path.resolve(repo, ws.worktree);
    const base = await headCommit(wt);
    expect(await codeRef(wt)).toBe(base);

    await fs.writeFile(path.join(wt, 'a.txt'), 'changed');
    const dirty = await codeRef(wt);
    expect(dirty).toMatch(new RegExp(`^${base}\\+[0-9a-f]{16}$`));
    await fs.writeFile(path.join(wt, 'new.txt'), 'n');
    const dirtier = await codeRef(wt);
    expect(dirtier).not.toBe(dirty);

    const changes = await changesSince(wt, base);
    expect(changes.files.sort()).toEqual(['a.txt', 'new.txt']);
    expect(changes.diff).toContain('+changed');

    // Hook 파일은 이 기기에서만 Git 추적에서 빠진다 (S-2). worktree도 같은 exclude를 쓴다.
    await addToExclude(wt, ['/.cursor/hooks.json']);
    await addToExclude(wt, ['/.cursor/hooks.json']);
    expect(await fs.readFile(path.join(repo, '.git/info/exclude'), 'utf8')).toMatch(/^\/\.cursor\/hooks\.json$/m);
    await fs.mkdir(path.join(wt, '.cursor'));
    await fs.writeFile(path.join(wt, '.cursor/hooks.json'), '{}');
    expect((await changesSince(wt, base)).files).not.toContain('.cursor/hooks.json');
    expect(await isTracked(wt, 'a.txt')).toBe(true);
    expect(await isTracked(wt, '.cursor/hooks.json')).toBe(false);

    // 지운 worktree를 같은 브랜치로 다시 만들 수 있다 (W-4).
    await fs.rm(wt, { recursive: true, force: true });
    await createWorktree(repo, ws.worktree, ws.branch);
    expect(existsSync(path.join(wt, 'a.txt'))).toBe(true);
  });
});

describe('docHistory (D-2)', () => {
  it('uses the commit date for clean files and the file date for changed or untracked ones', async () => {
    const repo = path.join(tmp, 'repo');
    await fs.mkdir(path.join(repo, 'docs'), { recursive: true });
    const run = gitInit(repo);
    await fs.writeFile(path.join(repo, 'docs/api.md'), 'a');
    await fs.writeFile(path.join(repo, 'docs/erd.md'), 'e');
    run('add', '.');
    execFileSync('git', ['commit', '-qm', 'init'], {
      cwd: repo,
      env: { ...process.env, GIT_COMMITTER_DATE: '2026-09-23T12:00:00', GIT_AUTHOR_DATE: '2026-09-23T12:00:00' },
    });
    await fs.writeFile(path.join(repo, 'docs/erd.md'), 'changed');
    await fs.writeFile(path.join(repo, 'docs/new.md'), 'n');

    const h = await docHistory(repo, ['docs/api.md', 'docs/erd.md', 'docs/new.md', 'docs/missing.md']);
    const today = localDate(new Date());
    expect(h).toEqual({ branch: 'main', dates: { 'docs/api.md': '2026-09-23', 'docs/erd.md': today, 'docs/new.md': today } });
  });

  it('falls back to file dates outside Git', async () => {
    await fs.writeFile(path.join(tmp, 'a.md'), 'a');
    expect(await docHistory(tmp, ['a.md'])).toEqual({ branch: undefined, dates: { 'a.md': localDate(new Date()) } });
  });
});

describe('process', () => {
  it('streams lines, logs output, and reports exit', async () => {
    const lines: string[] = [];
    const log = path.join(tmp, 'out.jsonl');
    const proc = await spawnAgent({
      command: process.execPath,
      args: ['-e', 'console.log(JSON.stringify({a:1})); process.stdout.write("tail"); console.error("warn")'],
      cwd: tmp,
      env: process.env,
      logFile: log,
      onLine: (l) => lines.push(l),
    });
    const res = await proc.exited;
    expect(res.code).toBe(0);
    expect(res.stderrTail).toBe('warn');
    expect(lines).toEqual(['{"a":1}', 'tail']);
    expect(await fs.readFile(log, 'utf8')).toBe('{"a":1}\ntail');
  });

  it('stops with SIGINT/SIGTERM and times out on a stubborn process (R-2)', async () => {
    const base = { cwd: tmp, env: process.env, logFile: path.join(tmp, 'l'), onLine: () => undefined };
    const polite = await spawnAgent({ ...base, command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'] });
    expect(await isProcessAlive(polite.pid, polite.startedAt)).toBe(true);
    expect(await polite.stop(2000)).toBe('exited');
    expect(await isProcessAlive(polite.pid, polite.startedAt)).toBe(false);

    const stubborn = await spawnAgent({
      ...base,
      command: process.execPath,
      args: ['-e', 'process.on("SIGINT",()=>{});process.on("SIGTERM",()=>{});console.log("ready");setInterval(()=>{},1000)'],
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(await stubborn.stop(400)).toBe('timeout');
    process.kill(stubborn.pid, 'SIGKILL');
  });

  it('detects PID reuse by start time (V-1)', async () => {
    expect(await isProcessAlive(process.pid, new Date(Date.now() - 3600_000).toISOString())).toBe(false);
  });
});

describe('hook config (E-8)', () => {
  const cmd = hookCommand('/usr/bin/node', false, '/ext/dist/hook.js', 'claude', '/repo/.agent-board/local/inbox');

  it('keeps existing hooks and replaces only ours', () => {
    const existing = { model: 'x', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'say done' }] }] } };
    const once = mergeMatcherHooks(existing, [['Stop'], ['PostToolUse', 'Edit']], cmd);
    const twice = mergeMatcherHooks(once, [['Stop'], ['PostToolUse', 'Edit']], cmd);
    expect(twice).toEqual(once);
    expect(once.model).toBe('x');
    const stop = (once.hooks as Record<string, { hooks: { command: string }[] }[]>).Stop!;
    expect(stop.map((g) => g.hooks[0]!.command)).toEqual(['say done', cmd]);
    expect(cmd).toContain(HOOK_MARKER);
  });

  it('writes cursor hooks.json format', () => {
    const merged = mergeCursorHooks({ hooks: { stop: [{ command: 'other' }] } }, cmd);
    expect(merged.version).toBe(1);
    expect((merged.hooks as Record<string, unknown[]>).stop).toEqual([{ command: 'other' }, { command: cmd }]);
  });

  it('installs into the project folder', async () => {
    const file = await installHooks(tmp, 'codex', cmd);
    expect(file).toBe(path.join(tmp, '.codex', 'hooks.json'));
    const json = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(Object.keys(json.hooks)).toContain('SessionStart');
  });
});

describe('hook script → inbox → store', () => {
  it('writes stdin JSON to the inbox and the store reads it', async () => {
    const script = path.resolve('dist/hook.js');
    if (!existsSync(script)) return; // `npm run build` 후에 검증된다.
    const inbox = path.join(tmp, 'local', 'inbox');
    const res = spawnSync(process.execPath, [script, 'claude', inbox], {
      input: JSON.stringify({ hook_event_name: 'Stop', session_id: 'S' }),
      env: { ...process.env, AGENT_BOARD_RUN_ID: '3', AGENT_BOARD_CARD_ID: 'TASK-2' },
    });
    expect(res.status).toBe(0);
    expect(res.stdout.toString()).toBe('');
    const store = new RunStore(path.join(tmp, 'local'));
    const [item] = await store.readInbox();
    expect(item).toMatchObject({ tool: 'claude', runId: '3', cardId: 'TASK-2', input: { session_id: 'S' } });
    await store.removeInbox(item!);
    expect(await store.readInbox()).toEqual([]);
  });
});

describe('hook script outbox (E-12)', () => {
  const script = path.resolve('dist/hook.js');
  const run = (tool: string, inbox: string, input: unknown, env: Record<string, string> = {}) =>
    spawnSync(process.execPath, [script, tool, inbox], { input: JSON.stringify(input), env: { ...process.env, ...env } });

  it('delivers queued messages as additional context once', async () => {
    if (!existsSync(script)) return;
    const local = path.join(tmp, 'local');
    const store = new RunStore(local);
    await store.pushOutbox('claude', 'S', 'one');
    await store.pushOutbox('claude', 'S', 'two');
    // 맥락을 넣을 수 없는 이벤트는 알림을 남겨 둔다.
    expect(run('claude', store.inboxDir, { hook_event_name: 'Stop', session_id: 'S' }).stdout.toString()).toBe('');
    const out = run('claude', store.inboxDir, { hook_event_name: 'PostToolUse', session_id: 'S' }).stdout.toString();
    expect(JSON.parse(out)).toEqual({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'one\n\ntwo' } });
    expect(run('claude', store.inboxDir, { hook_event_name: 'PostToolUse', session_id: 'S' }).stdout.toString()).toBe('');

    await store.pushOutbox('cursor', 'C', 'hi');
    expect(JSON.parse(run('cursor', store.inboxDir, { hook_event_name: 'postToolUse', conversation_id: 'C' }).stdout.toString())).toEqual({
      additional_context: 'hi',
    });
  });

  it('marks sessions started by the board itself', async () => {
    if (!existsSync(script)) return;
    const store = new RunStore(path.join(tmp, 'local'));
    run('codex', store.inboxDir, { hook_event_name: 'SessionStart', session_id: 'X' }, { AGENT_BOARD_INTERNAL: '1' });
    expect((await store.readInbox())[0]).toMatchObject({ internal: true });
  });
});

describe('RunStore (H-5)', () => {
  it('replays the event log on top of the snapshot', async () => {
    const store = new RunStore(tmp);
    const run = {
      runId: '1', cardId: 'TASK-1', role: 'implementer' as const, tool: 'claude' as const, status: 'waiting' as const,
      startedAt: '2026-01-01T00:00:00.000Z', inputVersions: {}, lastSeenAt: '2026-01-01T00:00:00.000Z', lastSeq: {}, statusVersionAtStart: 0,
    };
    await store.saveRuns({ runs: [run], seenEventIds: [] });
    const ev: AgentEvent = { eventId: 'e1', type: 'run.started', tool: 'claude', cardId: 'TASK-1', runId: '1', source: 'runner', seq: 0, occurredAt: '2026-01-01T00:00:01.000Z' };
    await store.appendEvent(ev);
    await store.appendEvent(ev);
    const state = await store.loadRuns();
    expect(state.runs[0]!.status).toBe('running');
    expect(state.seenEventIds).toEqual(['e1']);
  });

  it('drops entries left by the relink loop and rewrites both files', async () => {
    const store = new RunStore(tmp);
    const looped = 'h:1:linked:linked:linked';
    await store.saveRuns({ runs: [], seenEventIds: ['h:0', 'h:1:linked', looped] });
    const ev = (eventId: string, prompt?: string): AgentEvent => ({
      eventId, type: 'turn.started', tool: 'claude', toolSessionId: 'S', source: 'hook', seq: 1, occurredAt: '2026-01-01T00:00:01.000Z',
      ...(prompt ? { payload: { prompt } } : {}),
    });
    await store.appendEvent(ev('h:2', 'why does :linked:linked repeat?'));
    await store.appendEvent(ev(looped));
    await store.appendEvent(ev(`${looped}:linked`));

    const state = await store.loadRuns();
    expect(state.seenEventIds).toEqual(['h:0', 'h:1:linked', 'h:2']);
    expect((await store.loadEvents()).map((e) => e.eventId)).toEqual(['h:2']);
    expect(await fs.readFile(path.join(tmp, 'runs.json'), 'utf8')).not.toContain(looped);
  });
});

describe('parseReview', () => {
  it('reads the last JSON block', () => {
    const text = 'blah\n```json\n{"verdict":"x"}\n```\nmore\n```json\n{"verdict":"changes_requested","findings":[{"file":"a.ts","line":3,"message":"fix"},{"message":""}]}\n```';
    expect(parseReview(text)).toEqual({ verdict: 'changes_requested', findings: [{ file: 'a.ts', line: 3, message: 'fix' }] });
    expect(parseReview('no block')).toBeUndefined();
  });
});

describe('envWithBinary', () => {
  it('drops ELECTRON_RUN_AS_NODE and puts the CLI folder first', async () => {
    const { envWithBinary } = await import('../../src/runner/tools');
    process.env.ELECTRON_RUN_AS_NODE = '1';
    const env = envWithBinary('/opt/x/bin/claude', { AGENT_BOARD_RUN_ID: '1' });
    delete process.env.ELECTRON_RUN_AS_NODE;
    expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
    expect(env.PATH!.split(path.delimiter)[0]).toBe('/opt/x/bin');
    expect(env.AGENT_BOARD_RUN_ID).toBe('1');
  });
});
