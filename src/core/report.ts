// 구현자 보고와 말투 검사. 에이전트는 내용만 JSON으로 내고, 상태 라벨·형식·어미는 여기서 정한다.

import type { ReviewResult } from './runs';
import type { Progress } from './types';

export type CheckOutcome = 'pass' | 'fail' | 'not_run';

export interface ReportCheck {
  command: string;
  outcome: CheckOutcome;
  detail?: string;
}

export interface ImplementerReport {
  result: string;
  remaining: string[];
  blocker?: string;
  checks: ReportCheck[];
}

export type ReportStatus = 'done' | 'partial' | 'blocked';

/** 막힌 점이 있으면 막힘, 남은 일·통과 못 한 검증·미완료 체크리스트가 있으면 일부 완료. */
export function reportStatus(report: ImplementerReport, progress: Progress): ReportStatus {
  if (report.blocker) return 'blocked';
  const unchecked = progress.total > 0 && progress.done < progress.total;
  if (report.remaining.length || unchecked || report.checks.some((c) => c.outcome !== 'pass')) return 'partial';
  return 'done';
}

export type ToneIssue = 'passive' | 'formal' | 'honorific' | 'filler';

export interface ToneResult {
  text: string;
  issues: ToneIssue[];
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]️?(?:‍\p{Extended_Pictographic}️?)*/gu;
const EMPTY_ADVERBS = /(성공적으로|깔끔하게|완벽하게|훌륭하게)\s*/g;
/** 받침이 ㅆ·ㅄ이거나 '겠'이면 '습니다'를 '어요'로 바꿀 수 있다 (했·었·있·없·겠). */
const FORMAL_SSEUP = /([가-힣])습니다/g;
/** '-이다'로 끝나는 흔한 동사 어간의 앞 글자 (보이다, 쓰이다, 놓이다 …) */
const I_VERBS = ['보', '쓰', '놓', '쌓', '붙', '줄', '높', '섞', '녹', '숨', '먹', '끓'];
const ISSUES: [ToneIssue, RegExp][] = [
  ['passive', /(되었|됐)(어요|습니다|다)/],
  ['formal', /[가-힣](습|ㅂ)?니다|니까\?/],
  ['honorific', /[하되주보](시겠|시면|시고|시는|시기|시죠|시나요|셨|신|실|십시오)/],
  ['filler', /안녕하세요|죄송|미안합니다|미안해요|감사합니다|도움이 되/],
];

/**
 * 고칠 수 있는 것은 고치고(이모지, 느낌표, 빈 꾸밈말, 합쇼체 어미), 나머지는 문제 종류만 알린다.
 * 코드(`...`, ``` 블록) 안은 건드리지 않는다.
 */
export function lintTone(text: string): ToneResult {
  const issues = new Set<ToneIssue>();
  const out = splitCode(text)
    .map(({ code, part }) => {
      if (code) return part;
      const s = part
        .replace(EMOJI, '')
        .replace(/(?<=[\p{L}\p{N})\]])!+(?=\s|$)/gu, '.')
        .replace(EMPTY_ADVERBS, '')
        .replace(/합니다/g, '해요')
        .replace(/됩니다/g, '돼요')
        .replace(/아닙니다/g, '아니에요')
        .replace(/않습니다/g, '않아요')
        // '보입니다'의 '이'는 동사(보이다)라 '보여요', 나머지 '입니다'는 서술격 조사로 본다.
        .replace(/([가-힣])입니다/g, (_, prev: string) => prev + (I_VERBS.includes(prev) ? '여요' : hasFinal(prev) ? '이에요' : '예요'))
        .replace(FORMAL_SSEUP, (m, prev: string) => ([20, 18].includes(finalOf(prev)) || prev === '겠' ? `${prev}어요` : m))
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/[ \t]+(?=\n)/g, '');
      for (const [kind, re] of ISSUES) if (re.test(s)) issues.add(kind);
      return s;
    })
    .join('');
  return { text: out.trim(), issues: [...issues] };
}

/** 보고의 모든 글에 말투 검사를 적용한다. */
export function lintReport(report: ImplementerReport): { report: ImplementerReport; issues: ToneIssue[] } {
  const issues = new Set<ToneIssue>();
  const fix = (s: string) => {
    const r = lintTone(s);
    r.issues.forEach((i) => issues.add(i));
    return r.text;
  };
  return {
    report: {
      result: fix(report.result),
      remaining: report.remaining.map(fix),
      blocker: report.blocker === undefined ? undefined : fix(report.blocker),
      checks: report.checks.map((c) => ({ ...c, detail: c.detail === undefined ? undefined : fix(c.detail) })),
    },
    issues: [...issues],
  };
}

function finalOf(syllable: string): number {
  const code = syllable.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 ? code % 28 : 0;
}

function hasFinal(syllable: string): boolean {
  return finalOf(syllable) !== 0;
}

function splitCode(text: string): { code: boolean; part: string }[] {
  const out: { code: boolean; part: string }[] = [];
  const re = /```[\s\S]*?(?:```|$)|`[^`\n]*`/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ code: false, part: text.slice(last, m.index) });
    out.push({ code: true, part: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ code: false, part: text.slice(last) });
  return out;
}

export interface RunText {
  summary?: string;
  verification?: string;
  report?: ImplementerReport & { status: ReportStatus };
  review?: ReviewResult;
  tone: ToneIssue[];
}

/** 실행 이력에 보일 글. 보고가 있으면 보고로 카드를 만들고, 없으면 원문에 말투 검사만 적용한다. */
export function runText(
  run: { summary?: string; verification?: string; review?: ReviewResult },
  report: ImplementerReport | undefined,
  progress: Progress,
): RunText {
  const issues = new Set<ToneIssue>();
  const fix = (s: string | undefined) => {
    if (s === undefined) return undefined;
    const r = lintTone(s);
    r.issues.forEach((i) => issues.add(i));
    return r.text;
  };
  const review = run.review && { ...run.review, findings: run.review.findings.map((f) => ({ ...f, message: fix(f.message)! })) };
  if (report) {
    const linted = lintReport(report);
    linted.issues.forEach((i) => issues.add(i));
    return { report: { ...linted.report, status: reportStatus(report, progress) }, review, tone: [...issues] };
  }
  // 리뷰 결과는 보드가 그리므로 원문 끝의 JSON 블록은 요약에서 뺀다.
  const summary = review ? run.summary?.replace(/```(?:json)?\s*\n[\s\S]*?```\s*$/, '').trim() || undefined : run.summary;
  return { summary: fix(summary), verification: fix(run.verification), review, tone: [...issues] };
}
