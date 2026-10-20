import { describe, expect, it } from 'vitest';
import { autoMoveTarget, canAutoDone, moveCard, NO_REVIEW, orderBetween, unmetDoneConditions } from '../../src/core/status';
import type { Card } from '../../src/core/types';

const base: Card = {
  schemaVersion: 1,
  id: 'TASK-1',
  title: 't',
  status: 'todo',
  statusVersion: 0,
  order: 1,
  agents: {},
  relatedDocs: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const now = '2026-02-01T00:00:00.000Z';

describe('moveCard', () => {
  it('Todo → In Progress changes status only (K-1) and bumps statusVersion (K-3)', () => {
    const r = moveCard(base, 'in_progress', { now, hasActiveRun: false });
    expect(r.card.status).toBe('in_progress');
    expect(r.card.statusVersion).toBe(1);
    expect(r.effects).toEqual([]);
  });

  it('reordering within a column keeps statusVersion', () => {
    const r = moveCard(base, 'todo', { now, hasActiveRun: false, order: 5 });
    expect(r.card.statusVersion).toBe(0);
    expect(r.card.order).toBe(5);
  });

  it('moving a running card to Suspended requests stop', () => {
    const r = moveCard({ ...base, status: 'in_progress' }, 'suspended', { now, hasActiveRun: true });
    expect(r.effects).toEqual([{ kind: 'stopRuns' }]);
  });

  it('manual Done records unmet conditions; leaving Done clears it', () => {
    const r = moveCard(base, 'done', { now, hasActiveRun: false, unmet: ['checklist_incomplete'] });
    expect(r.card.manualDone).toEqual({ at: now, unmet: ['checklist_incomplete'] });
    expect(moveCard(r.card, 'review', { now, hasActiveRun: false }).card.manualDone).toBeUndefined();
  });
});

describe('Done conditions (K-2, P-6)', () => {
  it('full checklist alone is not enough', () => {
    expect(canAutoDone({ done: 3, total: 3 }, NO_REVIEW)).toBe(false);
    expect(unmetDoneConditions({ done: 3, total: 3 }, NO_REVIEW)).toEqual(['review_not_passed']);
  });

  it('requires review passed and no re-review', () => {
    expect(canAutoDone({ done: 3, total: 3 }, { lastPassed: true, rereviewRequired: false })).toBe(true);
    expect(unmetDoneConditions({ done: 1, total: 3 }, { lastPassed: true, rereviewRequired: true })).toEqual([
      'checklist_incomplete',
      'rereview_required',
    ]);
  });
});

describe('autoMoveTarget (K-4)', () => {
  const none = { done: 0, total: 0 };
  it('moves Todo to In Progress when work starts', () => {
    expect(autoMoveTarget('todo', 'start', none)).toBe('in_progress');
    expect(autoMoveTarget('review', 'start', none)).toBeUndefined();
    expect(autoMoveTarget('suspended', 'start', none)).toBeUndefined();
  });
  it('moves In Progress to Review only when the checklist is complete', () => {
    expect(autoMoveTarget('in_progress', 'turnEnd', { done: 2, total: 2 })).toBe('review');
    expect(autoMoveTarget('in_progress', 'turnEnd', { done: 1, total: 2 })).toBeUndefined();
    expect(autoMoveTarget('in_progress', 'turnEnd', none)).toBeUndefined();
    expect(autoMoveTarget('todo', 'turnEnd', { done: 2, total: 2 })).toBeUndefined();
  });
});

describe('orderBetween', () => {
  it('places between neighbours without touching them', () => {
    expect(orderBetween(1, 2)).toBe(1.5);
    expect(orderBetween(undefined, 1)).toBe(0);
    expect(orderBetween(3, undefined)).toBe(4);
    expect(orderBetween(undefined, undefined)).toBe(1);
  });
});
