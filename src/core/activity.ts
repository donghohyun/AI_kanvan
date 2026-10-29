// 카드 앞면의 마지막 활동 한 줄과 "확인 안 함" 표시.

import type { ImplementerReport } from './report';
import { lintTone } from './report';
import { TERMINAL, type RunRecord } from './runs';

export interface CardActivity {
  /** 활동 시각 (ISO) */
  at: string;
  /** 실행 중에 마지막으로 고친 파일 이름 */
  file?: string;
  /** 마지막 리뷰 판정 */
  verdict?: 'pass' | 'changes_requested';
  text?: string;
  /** 끝난 실행을 사용자가 아직 카드에서 열어 보지 않았다 */
  unread: boolean;
}

/** 가장 최근에 움직인 실행으로 마지막 활동을 정한다. 글은 말투 검사를 거친다. */
export function cardActivity(
  runs: RunRecord[],
  seenAt: string | undefined,
  parseReport: (reply: string | undefined) => ImplementerReport | undefined,
): CardActivity | undefined {
  const run = [...runs].sort((a, b) => (a.lastSeenAt < b.lastSeenAt ? -1 : a.lastSeenAt > b.lastSeenAt ? 1 : 0)).at(-1);
  if (!run) return undefined;
  const at = run.endedAt ?? run.lastSeenAt;
  const base = { at, unread: TERMINAL.has(run.status) && (!seenAt || at > seenAt) };
  if (run.status === 'running' && run.changes?.length) return { ...base, file: run.changes.at(-1)!.split(/[\\/]/).at(-1) };
  if (run.statusDetail) return { ...base, text: lintTone(run.statusDetail).text };
  if (run.review) return { ...base, verdict: run.review.verdict };
  const text = (run.role === 'implementer' ? parseReport(run.summary)?.result : undefined) ?? firstLine(run.summary);
  return { ...base, text: text === undefined ? undefined : lintTone(text).text };
}

/** 답의 첫 문장 줄. 제목 기호·목록 기호·강조는 뺀다. */
function firstLine(text: string | undefined): string | undefined {
  const line = text
    ?.split(/\r?\n/)
    .map((l) => l.replace(/^\s*(#{1,6}|[-*]|\d+\.)\s+/, '').replace(/\*\*/g, '').trim())
    .find((l) => l && !l.startsWith('```'));
  return line || undefined;
}
