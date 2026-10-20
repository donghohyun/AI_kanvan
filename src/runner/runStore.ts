// `.agent-board/local/`의 실행 기록. Git으로 공유하지 않는다 (spec 1.1).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { EMPTY_RUNS, replay, type AgentEvent, type RunsState } from '../core/runs';
import type { Role, ToolId } from '../core/types';
import { outboxFile } from './outbox';
import { readTextIfExists, toJson, writeFileAtomic } from '../storage/fsutil';

export interface SessionBinding {
  tool: ToolId;
  sessionId: string;
}

/** 카드 ID → 역할 → 현재 세션 (E-5) */
export type SessionBindings = Record<string, Partial<Record<Role, SessionBinding>>>;

export interface UnlinkedSession {
  tool: ToolId;
  sessionId: string;
  cwd: string;
}

export interface InboxItem {
  file: string;
  tool: ToolId;
  receivedAt: string;
  runId?: string;
  cardId?: string;
  /** 보드가 판단용으로 띄운 세션 */
  internal?: boolean;
  input: unknown;
}

export class RunStore {
  constructor(readonly localDir: string) {}

  private get runsFile(): string {
    return path.join(this.localDir, 'runs.json');
  }
  private get eventsFile(): string {
    return path.join(this.localDir, 'events.jsonl');
  }
  private get sessionsFile(): string {
    return path.join(this.localDir, 'sessions.json');
  }
  private get unlinkedFile(): string {
    return path.join(this.localDir, 'unlinked.json');
  }
  get outboxDir(): string {
    return path.join(this.localDir, 'outbox');
  }

  /** 다음 Hook 실행 때 세션에 전달할 알림을 쌓는다 (E-12). */
  async pushOutbox(tool: ToolId, sessionId: string, message: string): Promise<void> {
    const file = outboxFile(this.outboxDir, tool, sessionId);
    const text = await readTextIfExists(file);
    let messages: string[] = [];
    try {
      messages = text ? (JSON.parse(text) as { messages: string[] }).messages : [];
    } catch {
      messages = [];
    }
    await writeFileAtomic(file, toJson({ messages: [...messages, message] }));
  }

  get inboxDir(): string {
    return path.join(this.localDir, 'inbox');
  }
  runDir(cardId: string): string {
    return path.join(this.localDir, 'runs', cardId);
  }

  /** H-5: 스냅샷을 읽고 이벤트 로그를 다시 적용한다. 이미 처리한 이벤트는 eventId로 걸러진다. */
  async loadRuns(): Promise<RunsState> {
    const text = await readTextIfExists(this.runsFile);
    let state: RunsState = EMPTY_RUNS;
    if (text) {
      try {
        state = JSON.parse(text) as RunsState;
      } catch {
        state = EMPTY_RUNS;
      }
    }
    return replay(state, await this.loadEvents());
  }

  async loadEvents(): Promise<AgentEvent[]> {
    const text = (await readTextIfExists(this.eventsFile)) ?? '';
    return text
      .split('\n')
      .filter(Boolean)
      .flatMap((l) => {
        try {
          return [JSON.parse(l) as AgentEvent];
        } catch {
          return [];
        }
      });
  }

  async saveRuns(state: RunsState): Promise<void> {
    await writeFileAtomic(this.runsFile, toJson(state));
  }

  async appendEvent(event: AgentEvent): Promise<void> {
    await fs.mkdir(this.localDir, { recursive: true });
    await fs.appendFile(this.eventsFile, `${JSON.stringify(event)}\n`, 'utf8');
  }

  async loadSessions(): Promise<SessionBindings> {
    const text = await readTextIfExists(this.sessionsFile);
    return text ? (JSON.parse(text) as SessionBindings) : {};
  }

  async saveSessions(bindings: SessionBindings): Promise<void> {
    await writeFileAtomic(this.sessionsFile, toJson(bindings));
  }

  async loadUnlinked(): Promise<UnlinkedSession[]> {
    const text = await readTextIfExists(this.unlinkedFile);
    return text ? (JSON.parse(text) as UnlinkedSession[]) : [];
  }

  async saveUnlinked(list: UnlinkedSession[]): Promise<void> {
    await writeFileAtomic(this.unlinkedFile, toJson(list));
  }

  /** Hook 스크립트가 남긴 파일을 받은 순서대로 읽는다. */
  async readInbox(): Promise<InboxItem[]> {
    let names: string[];
    try {
      names = (await fs.readdir(this.inboxDir)).filter((n) => n.endsWith('.json')).sort();
    } catch {
      return [];
    }
    const items: InboxItem[] = [];
    for (const name of names) {
      const file = path.join(this.inboxDir, name);
      try {
        const raw = JSON.parse(await fs.readFile(file, 'utf8')) as Omit<InboxItem, 'file'>;
        items.push({ ...raw, file });
      } catch {
        await fs.rm(file, { force: true });
      }
    }
    return items;
  }

  async removeInbox(item: InboxItem): Promise<void> {
    await fs.rm(item.file, { force: true });
  }
}
