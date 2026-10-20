// S-3: 스키마 마이그레이션. 버전마다 한 단계씩 올린다.

import {
  BOARD_SCHEMA_VERSION,
  CARD_SCHEMA_VERSION,
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  TOOL_IDS,
  defaultBoard,
  KANBAN_STATUSES,
  type BoardConfig,
  type Card,
} from '../core/types';

export class SchemaError extends Error {}

type Raw = Record<string, unknown>;

const cardSteps: Record<number, (raw: Raw) => Raw> = {
  // 0 → 1: 스키마 버전 필드가 없던 초기 형식
  0: (raw) => ({ ...raw, schemaVersion: 1 }),
};

const boardSteps: Record<number, (raw: Raw) => Raw> = {
  0: (raw) => ({ ...raw, schemaVersion: 1 }),
  // 1 → 2: 구분 목록과 연결할 수 있는 도구 (TASK-2 CD-1)
  1: (raw) => ({
    ...raw,
    schemaVersion: 2,
    categories: raw.categories ?? DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    enabledTools: raw.enabledTools ?? [...TOOL_IDS],
  }),
};

function run(raw: Raw, current: number, steps: Record<number, (raw: Raw) => Raw>): { value: Raw; migrated: boolean } {
  let version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;
  if (version > current) throw new SchemaError(`unsupported schema version ${version}`);
  const migrated = version < current;
  let value = raw;
  while (version < current) {
    const step = steps[version];
    if (!step) throw new SchemaError(`no migration from version ${version}`);
    value = step(value);
    version += 1;
  }
  return { value, migrated };
}

export function migrateCard(raw: unknown): { card: Card; migrated: boolean } {
  if (!raw || typeof raw !== 'object') throw new SchemaError('card is not an object');
  const { value, migrated } = run(raw as Raw, CARD_SCHEMA_VERSION, cardSteps);
  if (typeof value.id !== 'string' || typeof value.title !== 'string') throw new SchemaError('card id/title missing');
  if (!KANBAN_STATUSES.includes(value.status as never)) throw new SchemaError('card status invalid');
  const card: Card = {
    agents: {},
    relatedDocs: [],
    statusVersion: 0,
    order: 0,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...(value as Partial<Card>),
  } as Card;
  return { card, migrated };
}

export function migrateBoard(raw: unknown): { board: BoardConfig; migrated: boolean } {
  if (!raw || typeof raw !== 'object') throw new SchemaError('board is not an object');
  const { value, migrated } = run(raw as Raw, BOARD_SCHEMA_VERSION, boardSteps);
  const defaults = defaultBoard();
  const board: BoardConfig = {
    ...defaults,
    ...(value as Partial<BoardConfig>),
    settings: { ...DEFAULT_SETTINGS, ...((value.settings as object | undefined) ?? {}) },
  } as BoardConfig;
  return { board, migrated };
}
