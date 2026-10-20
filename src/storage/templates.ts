import type { TaskDoc } from '../core/types';

const HEADINGS = {
  ko: { intent: ['목적', '배경', '범위'], spec: ['요구사항', '완료 조건'], plan: ['체크리스트'] },
  en: { intent: ['Purpose', 'Background', 'Scope'], spec: ['Requirements', 'Acceptance criteria'], plan: ['Checklist'] },
} as const;

const TITLES: Record<TaskDoc, string> = { intent: 'Intent', spec: 'Spec', plan: 'Plan' };

export function taskDocTemplate(doc: TaskDoc, id: string, title: string, locale: 'ko' | 'en' = 'ko'): string {
  const sections = HEADINGS[locale][doc].map((h) => `## ${h}\n`).join('\n');
  return `# ${id} ${title} — ${TITLES[doc]}\n\n${sections}`;
}
