// Markdown 파싱 (TASK-3). 그리기는 markdown.tsx가 한다.

import { HEADING_TAG } from '../../core/checklist';

export type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: { text: string; depth: number; checked?: boolean }[] }
  | { kind: 'table'; headers: string[]; rows: string[][]; align: ('left' | 'center' | 'right' | undefined)[] }
  | { kind: 'code'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'rule' };

const LIST = /^(\s*)([-*+]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence[1]!)) body.push(lines[i++]!);
      i += 1;
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]!.trim() });
      i += 1;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
      continue;
    }
    if (line.trim().startsWith('|') && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      const headers = cells(line);
      const align = cells(lines[i + 1]!).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : undefined));
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(cells(lines[i++]!));
      blocks.push({ kind: 'table', headers, rows, align });
      continue;
    }
    if (line.trim().startsWith('>')) {
      const body: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('>')) body.push(lines[i++]!.trim().replace(/^>\s?/, ''));
      blocks.push({ kind: 'quote', text: body.join('\n') });
      continue;
    }
    const item = LIST.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]!);
      const items: { text: string; depth: number; checked?: boolean }[] = [];
      while (i < lines.length) {
        const m = LIST.exec(lines[i]!);
        if (m) {
          items.push({ depth: Math.floor(m[1]!.replace(/\t/g, '    ').length / 2), text: m[4]!.trim(), checked: m[3] === undefined ? undefined : m[3] !== ' ' });
          i += 1;
        } else if (lines[i]!.trim() && /^\s{2,}/.test(lines[i]!) && items.length) {
          // 목록 항목이 다음 줄로 이어지는 경우
          items[items.length - 1]!.text += ` ${lines[i]!.trim()}`;
          i += 1;
        } else break;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|\s*```|\s*~~~|\s*>|\s*\|)/.test(lines[i]!) && !LIST.exec(lines[i]!)) para.push(lines[i++]!.trim());
    blocks.push({ kind: 'paragraph', text: para.join(' ') });
  }
  return blocks;
}

/** 제목 맨 앞의 [태그]를 떼어 낸다 (plan.md 구분 태그). */
export function splitTag(text: string): { tag?: string; title: string } {
  const m = HEADING_TAG.exec(text);
  return m ? { tag: m[1], title: text.slice(m[0].length).trim() } : { title: text };
}

/** 내용 없이 제목만 남은 절(템플릿 그대로인 절)을 뺀다. */
export function pruneEmptySections(blocks: Block[]): Block[] {
  return blocks.filter((b, i) => {
    if (b.kind !== 'heading') return true;
    for (let j = i + 1; j < blocks.length; j += 1) {
      const next = blocks[j]!;
      if (next.kind !== 'heading') return true;
      if (next.level <= b.level) return false;
    }
    return false;
  });
}

export interface DocumentOptions {
  /** 맨 앞의 H1(문서 제목)을 뺀다. 카드 문서처럼 제목을 따로 보여 줄 때 쓴다. */
  skipTitle?: boolean;
  /** 제목 수준을 이만큼 낮춘다. */
  demote?: number;
}

export function documentBlocks(source: string, { skipTitle, demote = 0 }: DocumentOptions = {}): Block[] {
  let blocks = parseMarkdown(source);
  if (skipTitle && blocks[0]?.kind === 'heading' && blocks[0].level === 1) blocks = blocks.slice(1);
  return pruneEmptySections(blocks).map((b) => (b.kind === 'heading' ? { ...b, level: Math.min(6, b.level + demote) } : b));
}

