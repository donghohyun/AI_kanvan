// 작업 ID 발급 (C-6). 삭제된 ID는 tombstone으로 남겨 재사용하지 않는다.

const ID_PATTERN = /^TASK-(\d+)$/;

export function parseTaskNumber(id: string): number | undefined {
  const m = ID_PATTERN.exec(id);
  return m ? Number(m[1]) : undefined;
}

export function isTaskId(id: string): boolean {
  return parseTaskNumber(id) !== undefined;
}

export function nextTaskId(usedIds: Iterable<string>): string {
  let max = 0;
  for (const id of usedIds) {
    const n = parseTaskNumber(id);
    if (n !== undefined && n > max) max = n;
  }
  return `TASK-${max + 1}`;
}

/** S-6: 같은 ID를 가진 카드 묶음. */
export function findDuplicateIds(cards: { id: string; dir: string }[]): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  for (const c of cards) byId.set(c.id, [...(byId.get(c.id) ?? []), c.dir]);
  for (const [id, dirs] of byId) if (dirs.length < 2) byId.delete(id);
  return byId;
}
