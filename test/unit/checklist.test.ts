import { describe, expect, it } from 'vitest';
import { ChecklistMismatchError, formatProgress, parseChecklist, progressOf, toggleChecklistItem, unstruck } from '../../src/core/checklist';

describe('parseChecklist (P-1)', () => {
  it('counts nested items and skips fenced code blocks', () => {
    const md = [
      '# Plan',
      '- [ ] one',
      '  - [x] nested',
      '* [X] star',
      '1. [ ] numbered',
      '```md',
      '- [ ] inside code',
      '```',
      '~~~',
      '- [x] inside tilde',
      '~~~',
      '- [] not an item',
      '- [ ]',
    ].join('\n');
    const items = parseChecklist(md);
    expect(items.map((i) => [i.line, i.checked, i.text])).toEqual([
      [1, false, 'one'],
      [2, true, 'nested'],
      [3, true, 'star'],
      [4, false, 'numbered'],
      [12, false, ''],
    ]);
    expect(items[1]!.depth).toBe(2);
  });

  it('does not close a backtick fence with tildes', () => {
    const md = ['```', '~~~', '- [ ] still code', '```', '- [ ] real'].join('\n');
    expect(parseChecklist(md).map((i) => i.text)).toEqual(['real']);
  });
});

describe('progress (P-2)', () => {
  it('shows 7/20', () => {
    const md = Array.from({ length: 20 }, (_, i) => `- [${i < 7 ? 'x' : ' '}] item ${i}`).join('\n');
    expect(formatProgress(progressOf(md))).toBe('7/20');
  });

  it('leaves struck-through items out', () => {
    const md = ['- [x] done', '- [ ] ~~dropped~~', '- [x] ~~dropped too~~', '- [ ] ~~part~~ only', '- [ ] todo'].join('\n');
    expect(parseChecklist(md).map((i) => i.dropped)).toEqual([false, true, true, false, false]);
    expect(formatProgress(progressOf(md))).toBe('1/3');
    expect(unstruck('~~dropped~~')).toBe('dropped');
    expect(unstruck('~~a~~ b')).toBe('~~a~~ b');
  });

  it('shows a dash when there are no items or no file', () => {
    expect(formatProgress(progressOf('# nothing'))).toBe('—');
    expect(formatProgress(progressOf(undefined))).toBe('—');
  });
});

describe('toggleChecklistItem (P-3)', () => {
  it('changes only the target line and keeps CRLF', () => {
    const md = '# Plan\r\n- [ ] a\r\n- [ ] b  \r\n\ttrailing\r\n';
    const out = toggleChecklistItem(md, 2, 'b', true);
    expect(out).toBe('# Plan\r\n- [ ] a\r\n- [x] b  \r\n\ttrailing\r\n');
    expect(toggleChecklistItem(out, 2, 'b', false)).toBe(md);
  });

  it('finds the item by text when lines shifted', () => {
    const md = '- [ ] new\n- [ ] a\n- [ ] b\n';
    expect(toggleChecklistItem(md, 1, 'b', true)).toBe('- [ ] new\n- [ ] a\n- [x] b\n');
  });

  it('throws when the item is gone or ambiguous', () => {
    expect(() => toggleChecklistItem('- [ ] a\n', 0, 'z', true)).toThrow(ChecklistMismatchError);
    expect(() => toggleChecklistItem('- [ ] x\n- [ ] a\n- [ ] a\n', 0, 'a', true)).toThrow(ChecklistMismatchError);
  });
});
