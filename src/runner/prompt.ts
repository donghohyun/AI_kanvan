// 에이전트에게 보내는 지시문과 리뷰 결과 파싱.

import type { CheckOutcome, ImplementerReport, ReportCheck } from '../core/report';
import type { ReviewFinding, ReviewResult } from '../core/runs';
import type { Card } from '../core/types';

export interface PromptDocs {
  intent: string;
  spec: string;
  plan: string;
  shared: { name: string; path: string }[];
}

function docList(card: Card, docs: PromptDocs): string {
  const shared = docs.shared.length
    ? `\nRelated shared documents:\n${docs.shared.map((d) => `- ${d.name}: ${d.path}`).join('\n')}`
    : '';
  return `Task ${card.id}: ${card.title}
${card.description ? `\n${card.description}\n` : ''}
Task documents (read them first):
- intent: ${docs.intent}
- spec: ${docs.spec}
- plan: ${docs.plan}${shared}`;
}

/** 보고 내용만 JSON으로 받는다. 상태 라벨·형식·어미는 보드가 정한다 (core/report.ts). */
const REPORT = `When you finish, end your reply with exactly one fenced JSON block. Agent Board builds the task card from it.
\`\`\`json
{"result": "what changed, in one sentence", "remaining": ["an unchecked plan.md item or follow-up"], "blocker": "only when blocked: the cause and what a person must decide or do", "checks": [{"command": "npm test", "outcome": "pass" | "fail" | "not_run", "detail": "42/42 passed, or why it did not run"}]}
\`\`\`
Write the text in the language of the task documents. Use an empty list when nothing remains, and list every check you ran or meant to run.`;

export function implementerPrompt(card: Card, docs: PromptDocs, branch: string | undefined): string {
  return `You are the implementer agent for this task, managed by Agent Board.

${docList(card, docs)}

Work in the current directory${branch ? ` (git worktree on branch ${branch})` : ''}.
- Follow plan.md in order and satisfy the completion criteria in spec.md.
- When you fully complete a checklist item, change "- [ ]" to "- [x]" for that item in plan.md (the path above). Never check items you did not finish.
- Do not edit intent.md or spec.md.

${REPORT}`;
}

export function fixPrompt(card: Card, docs: PromptDocs, findings: ReviewFinding[]): string {
  const list = findings.map((f) => `- ${f.file ? `${f.file}${f.line !== undefined ? `:${f.line}` : ''}: ` : ''}${f.message}`).join('\n');
  return `The reviewer requested changes for task ${card.id}. Fix the following findings in the current directory, keeping the task documents in mind (${docs.spec}, ${docs.plan}).

${list}

Update plan.md checkboxes only for items you actually complete.

${REPORT}`;
}

export function reviewerPrompt(card: Card, docs: PromptDocs, base: string | undefined): string {
  return `You are the reviewer agent for this task, managed by Agent Board. Review only; do not modify any files.

${docList(card, docs)}

Review the changes in the current directory${base ? ` against base commit ${base} (use \`git diff ${base}\` and \`git status\`)` : ' (use `git diff` and `git status`)'}.
Check correctness, the completion criteria in spec.md, and the plan in plan.md.

End your reply with exactly one fenced JSON block in this format:
\`\`\`json
{"verdict": "pass" | "changes_requested", "findings": [{"file": "path", "line": 1, "severity": "high" | "medium" | "low", "message": "the problem, why it breaks, and how to fix it"}]}
\`\`\`
Use "pass" with an empty findings list when no changes are needed. Write messages in the language of the task documents.`;
}

/** TASK-3 CA-2: 카드 문서의 그림 만들기. 글은 intent·spec·plan.md에 있고, 그림만 canvas.tsx에 둔다. */
export function canvasPrompt(card: Card, docs: PromptDocs, canvasPath: string, guidePath: string): string {
  return `You are adding figures to this task's document, managed by Agent Board.

${docList(card, docs)}

First read the canvas guide: ${guidePath}
The document's text is intent.md, spec.md and plan.md. Keep the text there; do not copy it into code.
Add figures only where a picture says it better than text: a flow or dependency as boxes and arrows, a chart, a comparison at a glance.
1. Write the figures as named exports (no default export) in exactly one file: ${canvasPath}
2. In the md files above, put a block where each figure belongs:
\`\`\`canvas FigureName
\`\`\`
Do not modify any other file. Reply with one sentence when done.`;
}

/** TASK-3 CA-3: 렌더링에 실패한 canvas 고치기 */
export function canvasFixPrompt(card: Card, canvasPath: string, guidePath: string, error: string): string {
  return `The canvas for task ${card.id} (${canvasPath}) failed to render in Agent Board:

${error}

Read the canvas guide at ${guidePath}, then fix ${canvasPath}. Do not modify any other file. Reply with one sentence when done.`;
}

/** TASK-3 CV-6: canvas의 newComposerChat */
export function canvasChatPrompt(card: Card, canvasPath: string, userPrompt: string): string {
  return `Regarding the canvas of task ${card.id} "${card.title}" (${canvasPath}):

${userPrompt}`;
}

/** 응답의 ```json 블록을 뒤에서부터 읽어 처음으로 해석되는 값을 돌려준다. */
function lastJson<T>(text: string | undefined, read: (v: Record<string, unknown>) => T | undefined): T | undefined {
  if (!text) return undefined;
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]!);
  for (const block of blocks.reverse()) {
    try {
      const v = JSON.parse(block) as unknown;
      const r = v && typeof v === 'object' ? read(v as Record<string, unknown>) : undefined;
      if (r) return r;
    } catch {
      continue;
    }
  }
  return undefined;
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const SEVERITIES: readonly string[] = ['high', 'medium', 'low'];
const OUTCOMES: readonly string[] = ['pass', 'fail', 'not_run'];

/** 응답의 마지막 ```json 블록에서 리뷰 결과를 읽는다. */
export function parseReview(reply: string | undefined): ReviewResult | undefined {
  return lastJson(reply, (v) => {
    if (v.verdict !== 'pass' && v.verdict !== 'changes_requested') return undefined;
    const findings = (Array.isArray(v.findings) ? v.findings : [])
      .map((f): ReviewFinding | undefined => {
        const o = (f ?? {}) as Record<string, unknown>;
        const message = text(o.message);
        if (!message) return undefined;
        return {
          message,
          file: text(o.file),
          line: typeof o.line === 'number' ? o.line : undefined,
          severity: SEVERITIES.includes(o.severity as string) ? (o.severity as ReviewFinding['severity']) : undefined,
        };
      })
      .filter((f): f is ReviewFinding => !!f);
    return { verdict: v.verdict, findings };
  });
}

/** 응답의 마지막 ```json 블록에서 구현자 보고를 읽는다. */
export function parseReport(reply: string | undefined): ImplementerReport | undefined {
  return lastJson(reply, (v) => {
    const result = text(v.result);
    if (!result) return undefined;
    const list = (x: unknown) => (Array.isArray(x) ? x : []);
    return {
      result,
      remaining: list(v.remaining).map(text).filter((s): s is string => !!s),
      blocker: text(v.blocker),
      checks: list(v.checks)
        .map((c): ReportCheck | undefined => {
          const o = (c ?? {}) as Record<string, unknown>;
          const command = text(o.command);
          if (!command) return undefined;
          return { command, outcome: OUTCOMES.includes(o.outcome as string) ? (o.outcome as CheckOutcome) : 'not_run', detail: text(o.detail) };
        })
        .filter((c): c is ReportCheck => !!c),
    };
  });
}
