// 사용자가 도구에서 직접 시작한 세션의 이벤트를 받기 위한 Hook 설정 (E-8).
// 기존 설정은 유지하고, 이 확장 프로그램이 넣은 항목(AGENT_BOARD_HOOK=1)만 교체한다.

import * as path from 'node:path';
import type { ToolId } from '../core/types';
import { readTextIfExists, toJson, writeFileAtomic } from '../storage/fsutil';

export const HOOK_MARKER = 'AGENT_BOARD_HOOK=1';

const CLAUDE_EVENTS: [string, string?][] = [
  ['SessionStart'],
  ['UserPromptSubmit'],
  // 모든 도구 사용 뒤에 실행해 보드의 알림을 바로 전달한다 (E-12).
  ['PostToolUse'],
  ['Notification'],
  ['PermissionRequest'],
  ['Stop'],
  ['StopFailure'],
  ['SessionEnd'],
];
const CODEX_EVENTS: [string, string?][] = [
  ['SessionStart'],
  ['UserPromptSubmit'],
  ['PostToolUse'],
  ['PermissionRequest'],
  ['Stop'],
  ['Interrupt'],
  ['SessionEnd'],
];
const CURSOR_EVENTS = ['sessionStart', 'beforeSubmitPrompt', 'afterFileEdit', 'postToolUse', 'stop', 'sessionEnd'];

export const HOOK_FILES: Record<ToolId, string> = {
  claude: path.join('.claude', 'settings.local.json'),
  codex: path.join('.codex', 'hooks.json'),
  cursor: path.join('.cursor', 'hooks.json'),
};

function quote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** node 실행 파일이 없으면 에디터 실행 파일을 node 모드로 쓴다. */
export function hookCommand(nodePath: string, useElectron: boolean, hookScript: string, tool: ToolId, inbox: string): string {
  const env = useElectron ? `${HOOK_MARKER} ELECTRON_RUN_AS_NODE=1` : HOOK_MARKER;
  return `${env} ${quote(nodePath)} ${quote(hookScript)} ${tool} ${quote(inbox)}`;
}

type Json = Record<string, unknown>;

async function readJson(file: string): Promise<Json> {
  const text = await readTextIfExists(file);
  if (!text?.trim()) return {};
  const v = JSON.parse(text) as unknown;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error(`${file} is not a JSON object`);
  return v as Json;
}

const isOurs = (h: unknown) => typeof (h as Json)?.command === 'string' && ((h as Json).command as string).includes(HOOK_MARKER);

/** Claude Code·Codex 형식: {"hooks": {"<Event>": [{"matcher", "hooks": [{"type": "command", "command"}]}]}} */
export function mergeMatcherHooks(config: Json, events: [string, string?][], command: string): Json {
  const hooks: Json = { ...((config.hooks as Json | undefined) ?? {}) };
  for (const [event, matcher] of events) {
    const groups = (Array.isArray(hooks[event]) ? (hooks[event] as Json[]) : [])
      .map((g) => ({ ...g, hooks: (Array.isArray(g.hooks) ? g.hooks : []).filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length > 0);
    groups.push({ ...(matcher ? { matcher } : {}), hooks: [{ type: 'command', command, timeout: 10 }] });
    hooks[event] = groups;
  }
  return { ...config, hooks };
}

/** Cursor 형식: {"version": 1, "hooks": {"<event>": [{"command"}]}} */
export function mergeCursorHooks(config: Json, command: string): Json {
  const hooks: Json = { ...((config.hooks as Json | undefined) ?? {}) };
  for (const event of CURSOR_EVENTS) {
    const entries = (Array.isArray(hooks[event]) ? (hooks[event] as Json[]) : []).filter((h) => !isOurs(h));
    hooks[event] = [...entries, { command }];
  }
  return { version: 1, ...config, hooks };
}

export async function installHooks(dir: string, tool: ToolId, command: string): Promise<string> {
  const file = path.join(dir, HOOK_FILES[tool]);
  const config = await readJson(file);
  const next =
    tool === 'cursor'
      ? mergeCursorHooks(config, command)
      : mergeMatcherHooks(config, tool === 'claude' ? CLAUDE_EVENTS : CODEX_EVENTS, command);
  await writeFileAtomic(file, toJson(next));
  return file;
}
