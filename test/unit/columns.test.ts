import { describe, expect, it } from 'vitest';
import { hiddenStatuses } from '../../src/webview/cards';

const counts = { todo: 0, in_progress: 5, review: 0, suspended: 0, done: 1 };

describe('board column hiding', () => {
  it('hides columns picked by hand', () => {
    expect([...hiddenStatuses({ hiddenColumns: ['done'] }, counts)]).toEqual(['done']);
  });

  it('hides empty columns but keeps todo for the new card button', () => {
    expect([...hiddenStatuses({ autoHideEmpty: true }, counts)]).toEqual(['review', 'suspended']);
    expect([...hiddenStatuses({ autoHideEmpty: true }, { ...counts, review: 2 })]).toEqual(['suspended']);
  });
});
