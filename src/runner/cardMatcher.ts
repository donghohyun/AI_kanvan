// 카드 자동 생성·연결 (E-9~E-12). 새 세션의 첫 요청이 어느 카드에 속하는지 판단하고 작업 문서에 반영한다.

import { parseTaskNumber } from '../core/ids';
import type { Card } from '../core/types';

export interface CardSummary {
  id: string;
  title: string;
  status: Card['status'];
  intent?: string;
  plan?: string;
}

/** 판단 결과. cardId가 없으면 새 카드를 만든다. */
export interface MatchDecision {
  cardId?: string;
  title: string;
  /** 새 카드면 목적, 기존 카드면 추가 요청 요약 */
  intent: string;
  /** 새 카드면 초기 요구사항, 기존 카드면 새로 추가할 요구사항 */
  spec: string[];
  /** 새 카드면 초기 체크리스트, 기존 카드면 새로 추가할 항목 */
  plan: string[];
  /** 새 카드의 페이지. 보드 페이지 목록에 있는 값만 */
  page?: string;
  /** 판단 방법 */
  via: 'explicit' | 'classifier' | 'keyword';
}

const TITLE_MAX = 60;

/** 프롬프트에 기존 카드 ID(TASK-n)가 있으면 그 카드. */
export function explicitMatch(prompt: string, cards: CardSummary[]): string | undefined {
  const ids = new Set(cards.map((c) => c.id));
  for (const m of prompt.matchAll(/\bTASK-(\d+)\b/gi)) {
    const id = `TASK-${Number(m[1])}`;
    if (ids.has(id) && parseTaskNumber(id) !== undefined) return id;
  }
  return undefined;
}

function bigrams(text: string): Set<string> {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const out = new Set<string>();
  for (const word of normalized.split(' ')) {
    if (word.length === 1) out.add(word);
    for (let i = 0; i < word.length - 1; i += 1) out.add(word.slice(i, i + 2));
  }
  return out;
}

/** 분류기를 쓸 수 없을 때의 대안: 제목·목적과 글자 쌍이 겹치는 비율(요청 기준). */
export function keywordMatch(prompt: string, cards: CardSummary[], threshold = 0.5): string | undefined {
  const p = bigrams(prompt);
  if (p.size === 0) return undefined;
  let best: { id: string; score: number } | undefined;
  for (const card of cards) {
    const c = bigrams(`${card.title} ${card.intent ?? ''}`);
    let common = 0;
    for (const g of p) if (c.has(g)) common += 1;
    const score = common / p.size;
    if (!best || score > best.score) best = { id: card.id, score };
  }
  return best && best.score >= threshold ? best.id : undefined;
}

export function titleFromPrompt(prompt: string): string {
  const line = prompt.trim().split(/\r?\n/)[0]!.trim();
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line || 'Untitled';
}

function excerpt(text: string | undefined, max: number): string {
  if (!text) return '';
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 분류기의 역할과 출력 형식. 도구가 지원하면 시스템 프롬프트로 보낸다. */
export const CLASSIFIER_SYSTEM = `You are the triage step of a kanban board for software tasks. You never talk to the user and never use tools.
You receive the board's open cards and a request that a developer just sent to a coding agent.
Decide whether the request continues one of the existing cards or is a new task, and prepare the task documents.

Reply with ONLY one JSON object and nothing else:
{"cardId": "<existing card id or null>", "title": "<short task title>", "intent": "<one paragraph>", "spec": ["<requirement>"], "plan": ["<checklist item>"], "page": "<page name or null>"}

Rules:
- Use an existing cardId only if the request clearly continues that card's work. Otherwise use null.
- If cardId is null: title, intent, spec and plan are the initial contents of a new card.
- page is the product screen the new card is about, copied exactly from the Pages list. Use null if no page fits or the list is empty.
- If cardId is set: intent summarizes only the added request; spec and plan contain only NEW requirements and checklist items (they may be empty).
- A question that asks for no change is still a task: describe what to find out.
- Write in the same language as the request. Keep checklist items short and concrete.`;

/** 분류기에 보내는 내용: 열린 카드 목록과 요청. */
export function classifierPrompt(prompt: string, cards: CardSummary[], pages: string[] = []): string {
  const list = cards.length
    ? cards
        .map((c) => `- ${c.id} [${c.status}] ${c.title}\n  intent: ${excerpt(c.intent, 400)}\n  plan: ${excerpt(c.plan, 400)}`)
        .join('\n')
    : '(no cards)';
  return `Open cards:
${list}

Pages:
${pages.length ? pages.map((p) => `- ${p}`).join('\n') : '(none)'}

Request:
"""
${prompt}
"""`;
}

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim()) : [];
}

/** 분류기 응답에서 JSON을 읽는다. 알 수 없는 카드 ID는 새 카드로 본다. */
export function parseClassifierOutput(
  text: string | undefined,
  prompt: string,
  cards: CardSummary[],
  pages: string[] = [],
): MatchDecision | undefined {
  if (!text) return undefined;
  const fenced = /```(?:json)?\s*\n([\s\S]*?)```/.exec(text)?.[1];
  const candidates = [fenced, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)].filter((x): x is string => !!x);
  for (const raw of candidates) {
    try {
      const v = JSON.parse(raw) as Record<string, unknown>;
      const cardId = typeof v.cardId === 'string' && cards.some((c) => c.id === v.cardId) ? v.cardId : undefined;
      const title = typeof v.title === 'string' && v.title.trim() ? v.title.trim().slice(0, TITLE_MAX) : titleFromPrompt(prompt);
      return {
        cardId,
        title,
        intent: typeof v.intent === 'string' && v.intent.trim() ? v.intent.trim() : prompt.trim(),
        spec: strings(v.spec),
        plan: strings(v.plan),
        page: typeof v.page === 'string' && pages.includes(v.page.trim()) ? v.page.trim() : undefined,
        via: 'classifier',
      };
    } catch {
      continue;
    }
  }
  return undefined;
}

/** 분류기 없이 내리는 결정. 문서에는 요청 원문만 남긴다. */
export function fallbackDecision(prompt: string, cards: CardSummary[]): MatchDecision {
  const explicit = explicitMatch(prompt, cards);
  const cardId = explicit ?? keywordMatch(prompt, cards);
  return { cardId, title: titleFromPrompt(prompt), intent: prompt.trim(), spec: [], plan: [], via: explicit ? 'explicit' : 'keyword' };
}

// ---- 작업 문서 갱신 ----

/**
 * 제목이 headings 중 하나인 `## ` 절의 끝(다음 같은 수준 이상 제목 앞)에 줄을 넣는다.
 * 절이 없으면 문서 끝에 새 절을 만든다.
 */
export function appendToSection(md: string, headings: string[], fallbackHeading: string, lines: string[]): string {
  if (lines.length === 0) return md;
  const eol = md.includes('\r\n') ? '\r\n' : '\n';
  const rows = md.split(/\r?\n/);
  const start = rows.findIndex((r) => {
    const m = /^##\s+(.+?)\s*$/.exec(r);
    return !!m && headings.some((h) => m[1]!.toLowerCase().startsWith(h.toLowerCase()));
  });
  if (start < 0) {
    const body = md.replace(/\s*$/, '');
    return `${body}${eol}${eol}## ${fallbackHeading}${eol}${eol}${lines.join(eol)}${eol}`;
  }
  let end = rows.findIndex((r, i) => i > start && /^#{1,2}\s/.test(r));
  if (end < 0) end = rows.length;
  // 절 끝의 빈 줄 앞에 넣는다.
  let insertAt = end;
  while (insertAt > start + 1 && rows[insertAt - 1]!.trim() === '') insertAt -= 1;
  const before = rows.slice(0, insertAt);
  if (insertAt === start + 1) before.push('');
  const after = rows.slice(insertAt);
  const joined = [...before, ...lines, ...(after.length && after[0]!.trim() !== '' ? [''] : []), ...after].join(eol);
  return joined.endsWith(eol) ? joined : `${joined}${eol}`;
}

export interface DocEdits {
  intent: string;
  spec: string;
  plan: string;
}

export interface SourceInfo {
  toolName: string;
  sessionId: string;
  date: string;
  locale: 'ko' | 'en';
}

const H = {
  ko: { purpose: '목적', background: '배경', req: '요구사항', checklist: '체크리스트', added: '추가 요청' },
  en: { purpose: 'Purpose', background: 'Background', req: 'Requirements', checklist: 'Checklist', added: 'Added request' },
};

function sourceLine(src: SourceInfo): string {
  return src.locale === 'ko'
    ? `${src.date} ${src.toolName} 세션 \`${src.sessionId}\`에서 자동으로 기록했습니다.`
    : `Recorded automatically from ${src.toolName} session \`${src.sessionId}\` on ${src.date}.`;
}

function quote(prompt: string): string {
  return prompt
    .trim()
    .split(/\r?\n/)
    .map((l) => `> ${l}`)
    .join('\n');
}

/** 새 카드의 템플릿 문서를 요청 내용으로 채운다. */
export function fillNewCardDocs(docs: DocEdits, d: MatchDecision, prompt: string, src: SourceInfo): DocEdits {
  const h = H[src.locale];
  return {
    intent: appendToSection(
      appendToSection(docs.intent, [h.purpose, 'Purpose', '목적'], h.purpose, [d.intent]),
      [h.background, 'Background', '배경'],
      h.background,
      [sourceLine(src), '', quote(prompt)],
    ),
    spec: appendToSection(docs.spec, [h.req, 'Requirements', '요구사항'], h.req, d.spec.map((s) => `- ${s}`)),
    plan: appendToSection(docs.plan, [h.checklist, 'Checklist', '체크리스트'], h.checklist, d.plan.map((s) => `- [ ] ${s}`)),
  };
}

/** 기존 카드에 추가 요청을 반영한다. */
export function addToExistingDocs(docs: DocEdits, d: MatchDecision, prompt: string, src: SourceInfo): DocEdits {
  const h = H[src.locale];
  const heading = `${h.added} (${src.date})`;
  const intent = `${docs.intent.replace(/\s*$/, '')}\n\n## ${heading}\n\n${d.intent}\n\n${sourceLine(src)}\n\n${quote(prompt)}\n`;
  return {
    intent,
    spec: appendToSection(docs.spec, [h.req, 'Requirements', '요구사항'], h.req, d.spec.map((s) => `- ${s}`)),
    plan: appendToSection(docs.plan, [h.checklist, 'Checklist', '체크리스트'], h.checklist, d.plan.map((s) => `- [ ] ${s}`)),
  };
}

/** 세션에 전달할 안내. 에이전트가 읽으므로 영어로 쓴다. */
export function sessionNotice(
  card: { id: string; title: string },
  created: boolean,
  d: MatchDecision,
  paths: { intent: string; spec: string; plan: string },
  canvas?: { path: string; guide: string },
): string {
  const added = created
    ? 'A new card was created for this request.'
    : `Your request was added to this card: ${d.spec.length} requirement(s) added to spec.md, ${d.plan.length} checklist item(s) added to plan.md.`;
  return `[Agent Board] This session is linked to card ${card.id} "${card.title}". ${added}
Task documents:
- intent: ${paths.intent}
- spec: ${paths.spec}
- plan: ${paths.plan}
Read them before continuing. When you fully finish a checklist item in plan.md, change "- [ ]" to "- [x]". Do not check items you did not finish.${
    canvas ? `\nThe card's figures (diagrams, charts) go in ${canvas.path} and are placed into the md files with \`\`\`canvas Name\`\`\` blocks. If you add or change figures, follow ${canvas.guide}.` : ''
  }`;
}
