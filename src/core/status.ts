// 칸반 상태 이동 규칙 (spec 6절).

import type { Card, KanbanStatus, Progress, UnmetCondition } from './types';

export interface ReviewSummary {
  /** 마지막 리뷰가 통과였는지 */
  lastPassed: boolean;
  /** 마지막 리뷰 이후 코드가 바뀌었는지 */
  rereviewRequired: boolean;
}

export const NO_REVIEW: ReviewSummary = { lastPassed: false, rereviewRequired: false };

export function unmetDoneConditions(progress: Progress, review: ReviewSummary): UnmetCondition[] {
  const unmet: UnmetCondition[] = [];
  if (progress.total === 0 || progress.done < progress.total) unmet.push('checklist_incomplete');
  if (!review.lastPassed) unmet.push('review_not_passed');
  if (review.rereviewRequired) unmet.push('rereview_required');
  return unmet;
}

/** K-2: 자동 Done은 모든 조건이 충족될 때만. */
export function canAutoDone(progress: Progress, review: ReviewSummary): boolean {
  return unmetDoneConditions(progress, review).length === 0;
}

export type MoveEffect = { kind: 'stopRuns' };

export interface MoveResult {
  card: Card;
  effects: MoveEffect[];
}

export interface MoveContext {
  now: string;
  /** 실행 중인 회차가 있는지 */
  hasActiveRun: boolean;
  /** Done으로 이동할 때 계산된 미완료 조건. 사용자가 확인한 뒤에만 이동한다. */
  unmet?: UnmetCondition[];
  /** 같은 열 안에서의 새 정렬 값 */
  order?: number;
}

/**
 * 사용자가 카드를 옮긴다. 상태가 바뀌면 statusVersion을 올린다(K-3).
 * Todo → In Progress는 상태만 바꾸고 에이전트를 실행하지 않는다(K-1).
 */
export function moveCard(card: Card, to: KanbanStatus, ctx: MoveContext): MoveResult {
  const effects: MoveEffect[] = [];
  const statusChanged = card.status !== to;
  const next: Card = {
    ...card,
    status: to,
    order: ctx.order ?? card.order,
    statusVersion: statusChanged ? card.statusVersion + 1 : card.statusVersion,
    updatedAt: ctx.now,
  };
  if (statusChanged && to === 'suspended' && ctx.hasActiveRun) effects.push({ kind: 'stopRuns' });
  if (statusChanged && to === 'done') {
    const unmet = ctx.unmet ?? [];
    if (unmet.length > 0) next.manualDone = { at: ctx.now, unmet };
    else delete next.manualDone;
  }
  if (statusChanged && card.status === 'done') {
    delete next.manualDone;
    delete next.doneAt;
  }
  // TASK-2 CD-2: 완료 시각 기록
  if (statusChanged && to === 'done') next.doneAt = ctx.now;
  return { card: next, effects };
}

/**
 * K-3: 실행 결과에 따른 칸반 상태 변경. 회차 시작 이후 statusVersion이 바뀌었으면(사용자가 옮겼으면) 적용하지 않는다.
 */
export function applyRunStatusChange(card: Card, statusVersionAtStart: number, to: KanbanStatus, now: string): Card | undefined {
  if (card.statusVersion !== statusVersionAtStart || card.status === to) return undefined;
  const next: Card = { ...card, status: to, statusVersion: card.statusVersion + 1, updatedAt: now };
  if (to === 'done') next.doneAt = now;
  else delete next.doneAt;
  return next;
}

/**
 * K-4: 구현자 실행에 따른 자동 이동. 시작하면 Todo → In Progress,
 * 응답이 끝났을 때 체크리스트가 모두 완료돼 있으면 In Progress → Review. 그 밖의 상태에서는 옮기지 않는다.
 */
export function autoMoveTarget(status: KanbanStatus, trigger: 'start' | 'turnEnd', progress: Progress): KanbanStatus | undefined {
  if (trigger === 'start') return status === 'todo' ? 'in_progress' : undefined;
  const complete = progress.total > 0 && progress.done === progress.total;
  return status === 'in_progress' && complete ? 'review' : undefined;
}

/** 이웃 카드 사이의 정렬 값. 다른 카드의 order를 바꾸지 않아 병합 충돌을 줄인다. */
export function orderBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return 1;
  if (before === undefined) return after! - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}
