// 웹뷰에서 쓰는 카드 계산 도우미.

import { cardCategories, completedAt, localDate, normalizeTags } from '../core/board';
import type { Card, Category } from '../core/types';
import type { BoardState, CardView } from '../shared/protocol';

export type Placed = CardView & { card: Card };

/** 카드 데이터를 읽은 카드만 (병합 충돌 등으로 읽지 못한 카드 제외) */
export function placedCards(state: BoardState): Placed[] {
  return state.cards.filter((c): c is Placed => !!c.card);
}

export function categoriesOf(view: CardView, categories: Category[]): Category[] {
  return cardCategories(normalizeTags(view.tags, categories), categories);
}

export interface BoardFilter {
  /** 선택한 구분 태그. 없으면 전체 */
  category?: string;
  /** Done 열에 보일 완료 시작일 `YYYY-MM-DD` */
  doneSince?: string;
}

/** TASK-2 DS-3, DS-4 */
export function matchesFilter(view: Placed, filter: BoardFilter, categories: Category[]): boolean {
  if (filter.category && !categoriesOf(view, categories).some((c) => c.tag === filter.category)) return false;
  if (filter.doneSince && view.card.status === 'done') {
    const at = completedAt(view.card);
    if (!at || localDate(at) < filter.doneSince) return false;
  }
  return true;
}

/** 오늘을 포함한 n일 전 날짜 */
export function daysAgo(n: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() - (n - 1));
  return localDate(d);
}

/** `YYYY-MM-DD` → `MM-DD` */
export function shortDate(date: string): string {
  return date.slice(5);
}
