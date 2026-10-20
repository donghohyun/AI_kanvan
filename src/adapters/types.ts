// 도구별 어댑터 공통 인터페이스 (T-1). 어댑터는 이벤트를 전달만 하고 판단은 코어가 한다 (H-4).

import type { AgentEventPayload, AgentEventType } from '../core/runs';
import type { ToolId } from '../core/types';

export interface Capabilities {
  run: boolean;
  stop: boolean;
  resume: boolean;
  /** 도구의 기존 세션 목록 조회 */
  sessions: boolean;
  hooks: boolean;
  /** 리뷰어용 읽기 전용 실행 (W-3) */
  readOnly: boolean;
}

export interface LaunchOptions {
  prompt: string;
  cwd: string;
  readOnly: boolean;
  /** 이어서 실행할 세션 */
  resumeSessionId?: string;
  /** 도구가 지원하면 미리 정한 새 세션 ID */
  newSessionId?: string;
  addDirs: string[];
  options?: Record<string, string>;
}

export interface LaunchSpec {
  args: string[];
  /** 실행 전에 확정되는 세션 ID */
  presetSessionId?: string;
}

/** 어댑터가 만든 이벤트. eventId·seq·시각은 실행 관리자가 채운다. */
export interface ParsedEvent {
  type: AgentEventType;
  sessionId?: string;
  payload?: AgentEventPayload;
}

export interface SessionInfo {
  id: string;
  updatedAt: string;
  title?: string;
}

export interface Adapter {
  id: ToolId;
  /** PATH에서 찾을 실행 파일 이름 후보 */
  binaries: string[];
  capabilities: Capabilities;
  buildLaunch(opts: LaunchOptions): LaunchSpec;
  /** headless 실행 stdout 한 줄을 이벤트로 바꾼다. */
  parseStreamLine(line: string): ParsedEvent[];
  /** Hook stdin JSON을 이벤트로 바꾼다. cwd는 카드 판별에 쓴다 (E-8). */
  parseHook(input: unknown): ParsedEvent[];
  listSessions(cwd: string): Promise<SessionInfo[]>;
  transcriptPath(cwd: string, sessionId: string): Promise<string | undefined>;
}

export function parseJsonLine(line: string): Record<string, unknown> | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return undefined;
  try {
    const v = JSON.parse(trimmed) as unknown;
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/** 응답 본문에서 `## Verification`(또는 `## 검증`) 절을 떼어 낸다. */
export function splitVerification(text: string | undefined): { summary?: string; verification?: string } {
  if (!text) return {};
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^#{1,3}\s*(verification|검증)/i.test(l));
  if (start < 0) return { summary: text };
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,3}\s/.test(l));
  const verification = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return { summary: text, verification: verification || undefined };
}
