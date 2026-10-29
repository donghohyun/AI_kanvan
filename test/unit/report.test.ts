import { describe, expect, it } from 'vitest';
import { lintTone, reportStatus, runText, type ImplementerReport } from '../../src/core/report';
import { ko } from '../../src/shared/i18n';

const report = (over: Partial<ImplementerReport> = {}): ImplementerReport => ({
  result: 'add 함수 추가',
  remaining: [],
  checks: [{ command: 'npm test', outcome: 'pass' }],
  ...over,
});

describe('reportStatus', () => {
  const all = { done: 3, total: 3 };
  it('is done only when nothing is left, every check passed and plan.md is checked', () => {
    expect(reportStatus(report(), all)).toBe('done');
    expect(reportStatus(report({ checks: [] }), all)).toBe('done');
  });
  it('is partial when anything is left', () => {
    expect(reportStatus(report({ remaining: ['E2E'] }), all)).toBe('partial');
    expect(reportStatus(report({ checks: [{ command: 'e2e', outcome: 'not_run' }] }), all)).toBe('partial');
    expect(reportStatus(report({ checks: [{ command: 'npm test', outcome: 'fail' }] }), all)).toBe('partial');
    expect(reportStatus(report(), { done: 2, total: 3 })).toBe('partial');
  });
  it('is blocked whenever there is a blocker', () => {
    expect(reportStatus(report({ blocker: '권한 필요' }), all)).toBe('blocked');
  });
});

describe('lintTone', () => {
  it('removes emoji, exclamation marks and empty adverbs', () => {
    expect(lintTone('✅ 성공적으로 추가했어요! 🎉').text).toBe('추가했어요.');
    expect(lintTone('👨‍💻 Done!!').text).toBe('Done.');
  });

  it('turns 합쇼체 endings into 해요체', () => {
    expect(lintTone('함수를 추가했습니다. 테스트가 필요합니다.').text).toBe('함수를 추가했어요. 테스트가 필요해요.');
    expect(lintTone('파일입니다. 문제입니다. 곧 됩니다. 확인하겠습니다. 없습니다.').text).toBe('파일이에요. 문제예요. 곧 돼요. 확인하겠어요. 없어요.');
    expect(lintTone('문서가 보입니다. 날짜가 아닙니다. 바뀌지 않습니다.').text).toBe('문서가 보여요. 날짜가 아니에요. 바뀌지 않아요.');
  });

  it('reports what it cannot fix', () => {
    expect(lintTone('함수가 추가됐어요.').issues).toEqual(['passive']);
    expect(lintTone('결과가 같습니다.').issues).toEqual(['formal']);
    expect(lintTone('확인하시면 돼요.').issues).toEqual(['honorific']);
    expect(lintTone('죄송해요, 실패했어요.').issues).toEqual(['filler']);
    expect(lintTone('추가했어요.').issues).toEqual([]);
  });

  it('leaves code alone', () => {
    expect(lintTone('`a !== b` 조건을 고쳤습니다! ```\nalert("hi!");\n```').text).toBe('`a !== b` 조건을 고쳤어요. ```\nalert("hi!");\n```');
  });
});

describe('runText', () => {
  it('builds the card from the report and lints its text', () => {
    const r = runText({ summary: 'raw' }, report({ result: '추가했습니다! ✅' }), { done: 1, total: 1 });
    expect(r.summary).toBeUndefined();
    expect(r.report).toMatchObject({ status: 'done', result: '추가했어요.' });
  });

  it('lints the raw reply and review findings when there is no report', () => {
    const r = runText(
      { summary: '완료했습니다 🎉', review: { verdict: 'changes_requested', findings: [{ message: '수정이 필요합니다!', severity: 'high' }] } },
      undefined,
      { done: 0, total: 0 },
    );
    expect(r.summary).toBe('완료했어요');

    const reviewed = runText({ summary: '수정할 곳이 있어요.\n```json\n{"verdict":"pass","findings":[]}\n```\n', review: { verdict: 'pass', findings: [] } }, undefined, { done: 0, total: 0 });
    expect(reviewed.summary).toBe('수정할 곳이 있어요.');
    expect(r.review!.findings[0]).toEqual({ message: '수정이 필요해요.', severity: 'high' });
  });
});

describe('Korean UI copy', () => {
  it('passes the tone check without changes', () => {
    const bad = Object.entries(ko).flatMap(([key, text]) => {
      const r = lintTone(text);
      return r.issues.length || r.text !== text.trim() ? [`${key}: ${r.issues.join(',') || r.text}`] : [];
    });
    expect(bad).toEqual([]);
  });
});
