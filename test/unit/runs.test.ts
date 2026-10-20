import { describe, expect, it } from 'vitest';
import {
  applyEvent,
  EMPTY_RUNS,
  latestRunStatus,
  nextLoopStep,
  replay,
  reviewSummaryOf,
  type AgentEvent,
  type RunRecord,
  type RunsState,
} from '../../src/core/runs';
import { applyRunStatusChange } from '../../src/core/status';
import type { Card } from '../../src/core/types';

const T0 = '2026-10-20T00:00:00.000Z';
const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();

function run(partial: Partial<RunRecord> & { runId: string }): RunRecord {
  return {
    cardId: 'TASK-1',
    role: 'implementer',
    tool: 'claude',
    status: 'waiting',
    startedAt: T0,
    inputVersions: {},
    lastSeenAt: T0,
    lastSeq: {},
    statusVersionAtStart: 0,
    ...partial,
  };
}

function ev(type: AgentEvent['type'], seq: number, extra: Partial<AgentEvent> = {}): AgentEvent {
  return { eventId: `e${seq}-${type}`, type, tool: 'claude', runId: '1', source: 'stream', seq, occurredAt: at(seq), ...extra };
}

const base: RunsState = { runs: [run({ runId: '1', toolSessionId: 'S' })], seenEventIds: [] };

describe('applyEvent', () => {
  it('follows the normal lifecycle', () => {
    const s = replay(base, [ev('run.started', 1), ev('response.completed', 2, { payload: { summary: 'done' } }), ev('run.ended', 3)]);
    expect(s.runs[0]).toMatchObject({ status: 'ended', summary: 'done', endedAt: at(3) });
  });

  it('ignores duplicate events (H-1)', () => {
    const once = replay(base, [ev('run.started', 1), ev('input.required', 2)]);
    const twice = replay(base, [ev('run.started', 1), ev('input.required', 2), ev('input.required', 2), ev('run.started', 1)]);
    expect(twice.runs).toEqual(once.runs);
  });

  it('does not reopen a finished run or go backwards (H-2)', () => {
    const s = replay(base, [ev('run.started', 1), ev('run.ended', 3), ev('turn.started', 2), ev('run.started', 4)]);
    expect(s.runs[0]!.status).toBe('ended');
  });

  it('a late event from an older run does not touch the newest run (H-3)', () => {
    const state: RunsState = {
      runs: [run({ runId: '1', toolSessionId: 'S', status: 'ended' }), run({ runId: '2', toolSessionId: 'S', startedAt: at(10), status: 'running' })],
      seenEventIds: [],
    };
    // runId 없이 세션 ID만 있는 hook 이벤트. 발생 시각이 2회차 시작 전이므로 1회차에 속한다.
    const late = ev('run.failed', 5, { runId: undefined, toolSessionId: 'S', source: 'hook' });
    const s = applyEvent(state, late).state;
    expect(latestRunStatus(s, 'TASK-1')).toEqual({ implementer: 'running' });
    expect(s.runs[0]!.status).toBe('ended');
  });

  it('an older response arriving late does not overwrite the summary (H-2)', () => {
    const newer = ev('response.completed', 2, { payload: { summary: 'B' } });
    const older = ev('response.completed', 1, { payload: { summary: 'A' } });
    expect(replay(base, [newer, older]).runs[0]!.summary).toBe('B');
    expect(replay(base, [older, newer]).runs[0]!.summary).toBe('B');
  });

  it('stopping + end becomes stopped', () => {
    const state: RunsState = { runs: [run({ runId: '1', status: 'stopping' })], seenEventIds: [] };
    expect(applyEvent(state, ev('run.ended', 1)).state.runs[0]!.status).toBe('stopped');
  });

  it('process.lost marks unknown; a late end event resolves it', () => {
    const s = replay(base, [ev('run.started', 1), ev('process.lost', 2, { source: 'runner', payload: { reason: 'gone' } })]);
    expect(s.runs[0]).toMatchObject({ status: 'unknown', statusDetail: 'gone' });
    expect(applyEvent(s, ev('run.ended', 3)).state.runs[0]!.status).toBe('ended');
  });

  it('matches runId together with cardId', () => {
    const state: RunsState = { runs: [run({ runId: '1', cardId: 'TASK-1' }), run({ runId: '1', cardId: 'TASK-2' })], seenEventIds: [] };
    const s = applyEvent(state, ev('run.started', 1, { cardId: 'TASK-2' })).state;
    expect(s.runs.map((r) => r.status)).toEqual(['waiting', 'running']);
  });

  it('reports unmatched events (E-8)', () => {
    const r = applyEvent(EMPTY_RUNS, ev('run.started', 1, { runId: undefined, toolSessionId: 'X' }));
    expect(r.effects).toEqual([{ kind: 'unmatched', event: expect.objectContaining({ toolSessionId: 'X' }) }]);
  });

  it('is order-independent for duplicated and shuffled streams', () => {
    const events = [ev('run.started', 1), ev('file.changed', 2), ev('response.completed', 3, { payload: { summary: 's' } }), ev('run.ended', 4)];
    const expected = replay(base, events).runs;
    for (let i = 0; i < 50; i += 1) {
      const shuffled = [...events, ...events].sort(() => Math.random() - 0.5);
      const got = replay(base, shuffled).runs[0]!;
      // 순서가 섞여도 종료 상태와 요약은 같다.
      expect(got.status).toBe(expected[0]!.status);
      expect(got.summary).toBe('s');
    }
  });
});

describe('review', () => {
  const reviewed = (verdict: 'pass' | 'changes_requested', ref: string, runId: string, msg = 'fix x') =>
    run({
      runId,
      role: 'reviewer',
      status: 'ended',
      reviewedRef: ref,
      review: { verdict, findings: verdict === 'pass' ? [] : [{ message: msg }] },
    });

  it('requires re-review when code changed after review (A-5)', () => {
    const state: RunsState = { runs: [reviewed('pass', 'abc', '1')], seenEventIds: [] };
    expect(reviewSummaryOf(state, 'TASK-1', 'abc')).toEqual({ lastPassed: true, rereviewRequired: false });
    expect(reviewSummaryOf(state, 'TASK-1', 'def')).toEqual({ lastPassed: true, rereviewRequired: true });
  });

  it('loops fix → review until the limit (A-6, A-7)', () => {
    const first = reviewed('changes_requested', 'a', '1', 'one');
    let state: RunsState = { runs: [first], seenEventIds: [] };
    expect(nextLoopStep(state, first, 2)).toMatchObject({ kind: 'fix', iteration: 1 });
    const fix = run({ runId: '2', status: 'ended', loopIteration: 1 });
    expect(nextLoopStep(state, fix, 2)).toEqual({ kind: 'review', iteration: 1 });
    const second = { ...reviewed('changes_requested', 'b', '3', 'two'), loopIteration: 1 };
    state = { runs: [first, fix, second], seenEventIds: [] };
    expect(nextLoopStep(state, second, 2)).toMatchObject({ kind: 'fix', iteration: 2 });
    const third = { ...reviewed('changes_requested', 'c', '5', 'three'), loopIteration: 2 };
    state = { runs: [first, fix, second, third], seenEventIds: [] };
    expect(nextLoopStep(state, third, 2)).toEqual({ kind: 'limit', max: 2 });
  });

  it('stops when the same findings repeat (A-7)', () => {
    const first = reviewed('changes_requested', 'a', '1', 'Same  Issue');
    const again = { ...reviewed('changes_requested', 'b', '3', 'same issue'), loopIteration: 1 };
    const state: RunsState = { runs: [first, again], seenEventIds: [] };
    expect(nextLoopStep(state, again, 3)).toEqual({ kind: 'conflict' });
  });

  it('manual implementer runs do not trigger review', () => {
    expect(nextLoopStep(base, run({ runId: '1', status: 'ended' }), 3)).toEqual({ kind: 'none' });
  });
});

describe('applyRunStatusChange (K-3)', () => {
  const card: Card = {
    schemaVersion: 1,
    id: 'TASK-1',
    title: 't',
    status: 'review',
    statusVersion: 4,
    order: 1,
    agents: {},
    relatedDocs: [],
    createdAt: T0,
    updatedAt: T0,
  };
  it('applies when the user has not moved the card since the run started', () => {
    expect(applyRunStatusChange(card, 4, 'done', T0)).toMatchObject({ status: 'done', statusVersion: 5 });
  });
  it('is ignored after a newer user change', () => {
    expect(applyRunStatusChange(card, 3, 'done', T0)).toBeUndefined();
  });
});
