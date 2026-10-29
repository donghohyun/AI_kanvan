import { describe, expect, it } from 'vitest';
import { cardActivity } from '../../src/core/activity';
import type { RunRecord } from '../../src/core/runs';
import { parseReport } from '../../src/runner/prompt';
import { elapsed, needsAttention } from '../../src/webview/cards';
import type { CardView } from '../../src/shared/protocol';

const run = (over: Partial<RunRecord>): RunRecord => ({
  runId: '1',
  cardId: 'TASK-1',
  role: 'implementer',
  tool: 'claude',
  status: 'ended',
  startedAt: '2026-10-29T00:00:00.000Z',
  lastSeenAt: '2026-10-29T00:10:00.000Z',
  inputVersions: {},
  lastSeq: {},
  statusVersionAtStart: 0,
  ...over,
});

describe('cardActivity', () => {
  it('shows the file being edited while running', () => {
    expect(cardActivity([run({ status: 'running', changes: ['src/a.ts', 'src/api/roas.ts'] })], undefined, parseReport)).toMatchObject({
      file: 'roas.ts',
      unread: false,
    });
  });

  it('uses the latest run, the report result, and lints the text', () => {
    const reply = '```json\n{"result":"재시도를 추가했습니다!","remaining":[],"checks":[]}\n```';
    const a = cardActivity(
      [run({ runId: '1', summary: 'old', lastSeenAt: '2026-10-29T00:01:00.000Z' }), run({ runId: '2', summary: reply, endedAt: '2026-10-29T00:20:00.000Z' })],
      undefined,
      parseReport,
    );
    expect(a).toEqual({ at: '2026-10-29T00:20:00.000Z', text: '재시도를 추가했어요.', unread: true });
  });

  it('is read once the card was opened after the run ended', () => {
    const r = run({ endedAt: '2026-10-29T00:20:00.000Z', summary: '## 끝\n- 완료' });
    expect(cardActivity([r], '2026-10-29T00:30:00.000Z', parseReport)).toMatchObject({ text: '끝', unread: false });
    expect(cardActivity([r], '2026-10-29T00:10:00.000Z', parseReport)?.unread).toBe(true);
  });

  it('prefers the status detail, then the review verdict', () => {
    expect(cardActivity([run({ status: 'input_required', statusDetail: '권한이 필요합니다' })], undefined, parseReport)).toMatchObject({ text: '권한이 필요해요', unread: false });
    expect(cardActivity([run({ role: 'reviewer', review: { verdict: 'pass', findings: [] } })], undefined, parseReport)?.verdict).toBe('pass');
    expect(cardActivity([], undefined, parseReport)).toBeUndefined();
  });
});

describe('card attention', () => {
  const view = (over: Partial<CardView>) => ({ sessions: [], ...over }) as CardView;
  it('needs a person when an agent waits or failed, or a result is unread', () => {
    expect(needsAttention(view({ sessions: [{ tool: 'claude', status: 'input_required' }] }))).toBe(true);
    expect(needsAttention(view({ sessions: [{ tool: 'codex', status: 'error' }] }))).toBe(true);
    expect(needsAttention(view({ activity: { at: '', unread: true } }))).toBe(true);
    expect(needsAttention(view({ sessions: [{ tool: 'claude', status: 'running' }] }))).toBe(false);
  });

  it('describes elapsed time in coarse units', () => {
    const now = Date.parse('2026-10-29T12:00:00.000Z');
    expect(elapsed('2026-10-29T11:59:30.000Z', now)).toEqual({ unit: 'now', n: 0 });
    expect(elapsed('2026-10-29T11:35:00.000Z', now)).toEqual({ unit: 'minutes', n: 25 });
    expect(elapsed('2026-10-29T02:00:00.000Z', now)).toEqual({ unit: 'hours', n: 10 });
    expect(elapsed('2026-10-26T12:00:00.000Z', now)).toEqual({ unit: 'days', n: 3 });
  });
});
