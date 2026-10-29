// 보드 컨트롤러가 실행 관리 기능에 접근하는 경계. 2단계 RunService가 구현한다.

import type { CardActivity } from '../core/activity';
import type { ReviewSummary } from '../core/status';
import { NO_REVIEW } from '../core/status';
import type { Card, Role, RunStatus, ToolId } from '../core/types';
import type { BoardState, CardSession, RunView, ToExtension, ToolInfo } from '../shared/protocol';

export interface RunsBridge {
  runStatus(cardId: string): Partial<Record<Role, RunStatus>>;
  reviewSummary(cardId: string): ReviewSummary;
  hasActiveRun(cardId: string): boolean;
  stopAll(card: Card): Promise<void>;
  tools(): ToolInfo[];
  unlinkedSessions(): BoardState['unlinkedSessions'];
  /** 에이전트 세션 Hook을 설치했는지 */
  hooksInstalled(): boolean;
  hookToolList(): ToolId[];
  cardSessions(cardId: string): CardSession[];
  cardActivity(cardId: string): CardActivity | undefined;
  runs(cardId: string): Promise<{ runs: RunView[]; sessions: Partial<Record<Role, string>> }>;
  /** 실행 관련 웹뷰 메시지를 처리한다. 처리하지 않으면 false. */
  handle(msg: ToExtension): Promise<boolean>;
  /** 보드를 다시 읽기 전에 호출된다 (Hook inbox 처리 등). */
  beforeReload(): Promise<void>;
}

export const NO_RUNS: RunsBridge = {
  runStatus: () => ({}),
  reviewSummary: () => NO_REVIEW,
  cardActivity: () => undefined,
  hasActiveRun: () => false,
  stopAll: async () => undefined,
  tools: () => [],
  unlinkedSessions: () => [],
  hooksInstalled: () => false,
  hookToolList: () => [],
  cardSessions: () => [],
  runs: async () => ({ runs: [], sessions: {} }),
  handle: async () => false,
  beforeReload: async () => undefined,
};
