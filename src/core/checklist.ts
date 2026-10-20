// plan.md 체크리스트 파싱과 단일 항목 토글 (P-1, P-3).

import type { Progress } from './types';

export interface ChecklistItem {
  /** 0부터 시작하는 줄 번호 */
  line: number;
  checked: boolean;
  text: string;
  depth: number;
  /** 가장 가까운 상위 제목의 구분 태그 (TASK-2 CT-1, CT-2). 없으면 미분류 */
  tag?: string;
}

const TASK_ITEM = /^(\s*)(?:[-*+]|\d+[.)])\s+\[([ xX])\](?=\s|$)\s?(.*)$/;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;
/** 제목 맨 앞의 구분 태그. 예: `## [BE] 로그인 API` */
export const HEADING_TAG = /^\[([A-Za-z0-9_-]{1,20})\]/;

function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

export function parseChecklist(content: string): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  let fence: string | null = null;
  // 현재 위치의 제목 계층. 태그 없는 제목은 상위 제목의 태그를 따른다.
  const headings: { level: number; tag?: string }[] = [];
  splitLines(content).forEach((raw, line) => {
    const fenceMatch = FENCE.exec(raw);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) {
        fence = marker;
      } else if (marker[0] === fence[0] && marker.length >= fence.length) {
        fence = null;
      }
      return;
    }
    if (fence !== null) return;
    const h = HEADING.exec(raw);
    if (h) {
      const level = h[1]!.length;
      while (headings.length && headings.at(-1)!.level >= level) headings.pop();
      headings.push({ level, tag: HEADING_TAG.exec(h[2]!.trim())?.[1] ?? headings.at(-1)?.tag });
      return;
    }
    const m = TASK_ITEM.exec(raw);
    if (!m) return;
    items.push({
      line,
      checked: m[2] !== ' ',
      text: m[3]!.trim(),
      depth: m[1]!.replace(/\t/g, '    ').length,
      tag: headings.at(-1)?.tag,
    });
  });
  return items;
}

export function progressOf(content: string | undefined): Progress {
  if (content === undefined) return { done: 0, total: 0 };
  const items = parseChecklist(content);
  return { done: items.filter((i) => i.checked).length, total: items.length };
}

export function formatProgress(p: Progress): string {
  return p.total === 0 ? '—' : `${p.done}/${p.total}`;
}

export class ChecklistMismatchError extends Error {
  constructor() {
    super('checklist item not found');
  }
}

/**
 * 지정한 항목의 체크 상태만 바꾼다. 다른 줄과 줄바꿈 문자는 그대로 둔다.
 * 줄 번호의 항목 텍스트가 expectedText와 다르면(파일이 그 사이 바뀜) 같은 텍스트의 항목을 찾는다.
 */
export function toggleChecklistItem(
  content: string,
  line: number,
  expectedText: string,
  checked: boolean,
): string {
  const items = parseChecklist(content);
  const target =
    items.find((i) => i.line === line && i.text === expectedText) ??
    (items.filter((i) => i.text === expectedText).length === 1
      ? items.find((i) => i.text === expectedText)
      : undefined);
  if (!target) throw new ChecklistMismatchError();

  const parts = content.split(/(\r?\n)/);
  const idx = target.line * 2;
  parts[idx] = parts[idx]!.replace(/\[([ xX])\]/, checked ? '[x]' : '[ ]');
  return parts.join('');
}
