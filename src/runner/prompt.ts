// 에이전트에게 보내는 지시문과 리뷰 결과 파싱.

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

const REPORT = `When you finish, reply with a short summary of what you changed, followed by a "## Verification" section listing the tests or checks you ran and their results.`;

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
{"verdict": "pass" | "changes_requested", "findings": [{"file": "path", "line": 1, "message": "what to change"}]}
\`\`\`
Use "pass" with an empty findings list when no changes are needed.`;
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

/** 응답의 마지막 ```json 블록에서 리뷰 결과를 읽는다. */
export function parseReview(text: string | undefined): ReviewResult | undefined {
  if (!text) return undefined;
  const blocks = [...text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]!);
  for (const block of blocks.reverse()) {
    try {
      const v = JSON.parse(block) as { verdict?: unknown; findings?: unknown };
      if (v.verdict !== 'pass' && v.verdict !== 'changes_requested') continue;
      const findings = (Array.isArray(v.findings) ? v.findings : [])
        .map((f): ReviewFinding | undefined => {
          const o = (f ?? {}) as Record<string, unknown>;
          if (typeof o.message !== 'string' || !o.message.trim()) return undefined;
          return {
            message: o.message,
            file: typeof o.file === 'string' && o.file ? o.file : undefined,
            line: typeof o.line === 'number' ? o.line : undefined,
          };
        })
        .filter((f): f is ReviewFinding => !!f);
      return { verdict: v.verdict, findings };
    } catch {
      continue;
    }
  }
  return undefined;
}
