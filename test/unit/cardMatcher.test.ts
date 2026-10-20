import { describe, expect, it } from 'vitest';
import {
  addToExistingDocs,
  appendToSection,
  classifierPrompt,
  explicitMatch,
  fallbackDecision,
  fillNewCardDocs,
  keywordMatch,
  parseClassifierOutput,
  sessionNotice,
  titleFromPrompt,
  type CardSummary,
} from '../../src/runner/cardMatcher';
import { classifierArgs, classifierText } from '../../src/runner/classifier';
import { taskDocTemplate } from '../../src/storage/templates';

const cards: CardSummary[] = [
  { id: 'TASK-1', title: '로그인 구현', status: 'in_progress', intent: '이메일과 비밀번호로 로그인한다' },
  { id: 'TASK-2', title: '결제 연동', status: 'todo', intent: '토스 결제 API를 연동한다' },
];

describe('matching (E-10)', () => {
  it('uses an explicit card ID', () => {
    expect(explicitMatch('task-2 마저 해줘', cards)).toBe('TASK-2');
    expect(explicitMatch('TASK-9 해줘', cards)).toBeUndefined();
  });

  it('falls back to keyword overlap', () => {
    expect(keywordMatch('로그인 구현에 비밀번호 재설정 추가', cards)).toBe('TASK-1');
    expect(keywordMatch('README 오타 수정', cards)).toBeUndefined();
    expect(fallbackDecision('결제 연동 마저', cards)).toMatchObject({ cardId: 'TASK-2', via: 'keyword' });
  });

  it('parses classifier output and ignores unknown card IDs', () => {
    const out = 'sure\n```json\n{"cardId":"TASK-1","title":"t","intent":"i","spec":["a",""],"plan":["b"]}\n```';
    expect(parseClassifierOutput(out, 'p', cards)).toEqual({ cardId: 'TASK-1', title: 't', intent: 'i', spec: ['a'], plan: ['b'], via: 'classifier' });
    expect(parseClassifierOutput('{"cardId":"TASK-7","title":""}', 'new thing', cards)).toMatchObject({ cardId: undefined, title: 'new thing' });
    expect(parseClassifierOutput('no json', 'p', cards)).toBeUndefined();
  });

  it('lists cards in the classifier prompt', () => {
    const text = classifierPrompt('결제 실패 처리', cards);
    expect(text).toContain('TASK-2 [todo] 결제 연동');
    expect(text).toContain('결제 실패 처리');
  });

  it('makes a short title', () => {
    expect(titleFromPrompt('  첫 줄\n둘째 줄')).toBe('첫 줄');
    expect(titleFromPrompt('x'.repeat(100))).toHaveLength(60);
  });
});

describe('classifier CLI', () => {
  it('builds commands without tools or saved sessions', () => {
    expect(classifierArgs('claude', 'p', '/tmp')).toEqual(expect.arrayContaining(['--system-prompt', '--tools', '', '--no-session-persistence', '--safe-mode']));
    expect(classifierArgs('codex', 'p', '/tmp').at(-1)).toMatch(/^You are the triage step[\s\S]*\n\np$/);
    expect(classifierArgs('codex', 'p', '/tmp')).toEqual(expect.arrayContaining(['-s', 'read-only', '--ephemeral']));
  });

  it('reads the final text', () => {
    expect(classifierText('claude', '{"type":"result","is_error":false,"result":"ok"}')).toBe('ok');
    expect(classifierText('claude', '{"type":"result","is_error":true,"result":"bad"}')).toBeUndefined();
    const codex = ['{"type":"thread.started"}', '{"type":"item.completed","item":{"type":"agent_message","text":"one"}}', '{"type":"item.completed","item":{"type":"agent_message","text":"two"}}'].join('\n');
    expect(classifierText('codex', codex)).toBe('two');
  });
});

describe('document updates (E-11)', () => {
  const src = { toolName: 'Cursor', sessionId: 'abc', date: '2026-10-20', locale: 'ko' as const };
  const decision = { title: '비밀번호 재설정', intent: '비밀번호를 잊은 사용자가 재설정한다', spec: ['메일로 링크 발송'], plan: ['메일 발송 API', '재설정 화면'], via: 'classifier' as const };

  it('appends inside a section, before the next heading', () => {
    const md = '# T\n\n## 요구사항\n\n- 기존\n\n## 완료 조건\n\n- x\n';
    expect(appendToSection(md, ['요구사항'], '요구사항', ['- 새것'])).toBe('# T\n\n## 요구사항\n\n- 기존\n- 새것\n\n## 완료 조건\n\n- x\n');
    expect(appendToSection('# T\n', ['요구사항'], '요구사항', ['- a'])).toBe('# T\n\n## 요구사항\n\n- a\n');
    expect(appendToSection('# T\n\n## 체크리스트\n', ['체크리스트'], '체크리스트', ['- [ ] a'])).toBe('# T\n\n## 체크리스트\n\n- [ ] a\n');
  });

  it('fills a new card from the request', () => {
    const docs = { intent: taskDocTemplate('intent', 'TASK-3', 't'), spec: taskDocTemplate('spec', 'TASK-3', 't'), plan: taskDocTemplate('plan', 'TASK-3', 't') };
    const out = fillNewCardDocs(docs, decision, '비번 찾기 만들어줘', src);
    expect(out.intent).toContain('## 목적\n\n비밀번호를 잊은 사용자가 재설정한다');
    expect(out.intent).toContain('> 비번 찾기 만들어줘');
    expect(out.spec).toContain('## 요구사항\n\n- 메일로 링크 발송');
    expect(out.plan).toContain('- [ ] 메일 발송 API\n- [ ] 재설정 화면');
  });

  it('adds to an existing card', () => {
    const docs = { intent: '# I\n', spec: '# S\n\n## 요구사항\n\n- 기존\n', plan: '# P\n\n## 체크리스트\n\n- [x] 기존\n' };
    const out = addToExistingDocs(docs, decision, '재설정도 해줘', src);
    expect(out.intent).toContain('## 추가 요청 (2026-10-20)');
    expect(out.spec).toBe('# S\n\n## 요구사항\n\n- 기존\n- 메일로 링크 발송\n');
    expect(out.plan).toBe('# P\n\n## 체크리스트\n\n- [x] 기존\n- [ ] 메일 발송 API\n- [ ] 재설정 화면\n');
  });

  it('tells the session where the documents are (E-12)', () => {
    const text = sessionNotice({ id: 'TASK-1', title: '로그인' }, false, decision, { intent: '/i', spec: '/s', plan: '/p' });
    expect(text).toContain('TASK-1');
    expect(text).toContain('1 requirement(s)');
    expect(text).toContain('- plan: /p');
    expect(text).not.toContain('canvas');
    expect(sessionNotice({ id: 'T', title: 't' }, true, decision, { intent: '/i', spec: '/s', plan: '/p' }, { path: '/c.tsx', guide: '/g.md' })).toContain(
      'document is /c.tsx (a cursor/canvas file). If you create or update it, follow /g.md',
    );
  });
});
