// 확장 프로그램 ↔ 보드 웹뷰 메시지.

import type { TagProgress } from '../core/board';
import type { ChecklistItem } from '../core/checklist';
import type {
  AgentAssignment,
  BoardConfig,
  BoardSettings,
  Card,
  CategoryColor,
  DocCategory,
  KanbanStatus,
  Progress,
  Role,
  RunStatus,
  TaskDoc,
  ToolId,
} from '../core/types';
import type { Locale } from './i18n';

export interface RunView {
  runId: string;
  role: Role;
  tool: ToolId;
  status: RunStatus;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  verification?: string;
  changes?: string[];
  diff?: string;
  review?: { verdict: 'pass' | 'changes_requested'; findings: { file?: string; line?: number; message: string }[] };
  reviewedRef?: string;
  transcriptPath?: string;
  statusDetail?: string;
  inputChanged: boolean;
}

/** 카드에 연결된 세션 하나 (TASK-2 DS-9) */
export interface CardSession {
  tool: ToolId;
  sessionId?: string;
  status: RunStatus;
}

/** 이 기기 설정 (VS Code 설정, TASK-2 ST-1) */
export interface MachineSettings {
  toolPaths: Partial<Record<ToolId, string>>;
  autoCreateCards: boolean;
  matcherTool: 'auto' | ToolId | 'none';
}

export interface CardView {
  dir: string;
  card?: Card;
  error?: 'conflict' | 'invalid';
  errorDetail?: string;
  progress: Progress;
  /** plan.md 항목의 구분별 진행률 (TASK-2 CT-2) */
  tags: TagProgress;
  sessions: CardSession[];
  hasCanvas: boolean;
  duplicate: boolean;
  runStatus: Partial<Record<Role, RunStatus>>;
  rereviewRequired: boolean;
  worktreeMissing: boolean;
}

export interface ToolInfo {
  id: ToolId;
  installed: boolean;
  version?: string;
  capabilities: Record<string, boolean>;
}

export interface BoardState {
  initialized: boolean;
  locale: Locale;
  board?: BoardConfig;
  boardError?: 'conflict' | 'invalid';
  cards: CardView[];
  sharedDocExists: Record<string, boolean>;
  /** 공용 문서 ID → 마지막 변경일과 브랜치 (D-2) */
  sharedDocMeta: Record<string, { date?: string; branch?: string }>;
  tools: ToolInfo[];
  /** 에이전트 세션 Hook 설치 여부. 없으면 채팅 요청이 보드에 반영되지 않는다. */
  hooksInstalled: boolean;
  /** Hook을 설치한 도구 */
  hookTools: ToolId[];
  machine: MachineSettings;
  /** 카드를 판별하지 못한 세션 (E-8) */
  unlinkedSessions: { tool: ToolId; sessionId: string; cwd: string }[];
}

export interface CardPatch {
  title?: string;
  description?: string;
  agents?: Partial<Record<Role, AgentAssignment | null>>;
  relatedDocs?: string[];
  autoReview?: boolean;
  /** 빈 문자열이면 지운다 */
  startDate?: string;
  dueDate?: string;
  dependsOn?: string[];
}

export type ToExtension =
  | { type: 'ready' }
  | { type: 'init' }
  | { type: 'createCard'; title: string }
  | { type: 'updateCard'; id: string; patch: CardPatch }
  | { type: 'moveCard'; id: string; to: KanbanStatus; beforeId?: string; afterId?: string }
  | { type: 'deleteCard'; dir: string }
  | { type: 'renumberCard'; dir: string }
  | { type: 'openCardFile'; dir: string }
  | { type: 'openTaskDoc'; dir: string; doc: TaskDoc }
  | { type: 'watchDoc'; dir: string; doc: TaskDoc }
  | { type: 'unwatchDoc'; dir: string; doc: TaskDoc }
  | { type: 'saveDoc'; dir: string; doc: TaskDoc; content: string; base: string | undefined }
  | { type: 'compareDoc'; dir: string; doc: TaskDoc; content: string }
  | { type: 'toggleChecklist'; dir: string; line: number; text: string; checked: boolean }
  | { type: 'addSharedDoc' }
  | { type: 'openSharedDoc'; id: string }
  | { type: 'renameSharedDoc'; id: string }
  | { type: 'setSharedDocCategory'; id: string; category: DocCategory }
  | { type: 'setSharedDocTags'; id: string; tags: string[] }
  | { type: 'openSession'; dir: string; tool: ToolId; sessionId: string }
  | { type: 'relinkSharedDoc'; id: string }
  | { type: 'removeSharedDoc'; id: string }
  | { type: 'createDocTask'; id: string }
  | { type: 'loadRuns'; dir: string }
  | { type: 'startRun'; dir: string; role: Role; resume: boolean }
  | { type: 'stopRun'; dir: string; role: Role }
  | { type: 'resolveRun'; dir: string; runId: string; status: 'ended' | 'error' }
  | { type: 'openTranscript'; dir: string; runId: string }
  | { type: 'pickSession'; dir: string; role: Role }
  | { type: 'newSession'; dir: string; role: Role }
  | { type: 'linkSession'; tool: ToolId; sessionId: string }
  | { type: 'requestReview'; dir: string }
  | { type: 'createWorktree'; dir: string }
  | { type: 'installHooks' }
  | { type: 'addCategory'; tag: string; name: string; color: CategoryColor }
  | { type: 'updateCategory'; tag: string; name?: string; color?: CategoryColor }
  | { type: 'moveCategory'; tag: string; offset: -1 | 1 }
  | { type: 'deleteCategory'; tag: string }
  | { type: 'setToolEnabled'; tool: ToolId; enabled: boolean }
  | { type: 'updateBoardSettings'; patch: Partial<BoardSettings> }
  | { type: 'setMachineSetting'; key: 'toolPaths' | 'autoCreateCards' | 'matcherTool'; value: unknown }
  | { type: 'detectTools' }
  | { type: 'loadCanvas'; dir: string }
  | { type: 'unwatchCanvas'; dir: string }
  | { type: 'canvasState'; dir: string; key: string; value: unknown }
  | { type: 'canvasAction'; dir: string; action: CanvasActionMessage }
  | { type: 'canvasError'; dir: string; message: string }
  | { type: 'openExternal'; href: string }
  | { type: 'requestCanvas'; dir: string }
  | { type: 'fixCanvas'; dir: string; error: string }
  | { type: 'createCanvas'; dir: string }
  | { type: 'openCanvasFile'; dir: string };

/** canvas의 useCanvasAction 동작 (TASK-3 CV-6) */
export type CanvasActionMessage =
  | { type: 'openFile'; path: string; selection?: { startLineNumber?: number; startColumn?: number; endLineNumber?: number; endColumn?: number } }
  | { type: 'openAgent'; agentId: string }
  | { type: 'newComposerChat'; userPrompt?: string };

/**
 * 카드 문서 탭·공용 문서 화면에 보낼 문서 (TASK-3 CV-1).
 * `dir`은 카드 ID, 또는 공용 문서면 `shared:<문서 ID>`다.
 */
export interface CanvasPayload {
  dir: string;
  kind: 'card' | 'shared';
  /** canvas.tsx(카드) 또는 공용 문서 파일이 있는지 */
  exists: boolean;
  /** canvas가 없는 카드의 기본 문서용 작업 문서 */
  docs?: { intent?: string; spec?: string; plan?: string };
  /** Markdown 공용 문서 내용 */
  markdown?: string;
  /** 보드에서 그릴 수 없는 공용 문서 (이미지 등) */
  unsupported?: boolean;
  path?: string;
  /** 신뢰하지 않는 작업 공간이면 실행하지 않는다 (CV-9) */
  trusted: boolean;
  code?: string;
  error?: string;
  state: Record<string, unknown>;
  canStart: boolean;
}

export type ToWebview =
  | { type: 'state'; state: BoardState }
  | { type: 'doc'; dir: string; doc: TaskDoc; content: string | undefined }
  | { type: 'docSaved'; dir: string; doc: TaskDoc; content: string }
  | { type: 'docConflict'; dir: string; doc: TaskDoc; fileContent: string | undefined }
  | { type: 'checklist'; dir: string; items: ChecklistItem[] }
  | { type: 'runs'; dir: string; runs: RunView[]; sessions: Partial<Record<Role, string>> }
  | { type: 'showSettings' }
  | { type: 'canvas'; payload: CanvasPayload }
  /** 설정 화면 입력 검증 실패 (ST-7) */
  | { type: 'settingError'; field: string; message: string };
