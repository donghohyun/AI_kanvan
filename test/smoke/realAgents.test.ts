// 실제 Claude Code·Codex·Cursor CLI로 구현 → 리뷰 한 바퀴를 돌린다.
// AGENT_BOARD_SMOKE=claude,codex npm run test:smoke
// 구현자와 리뷰어를 다르게 하려면 `claude+codex`처럼 적는다.

import { execFileSync } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { progressOf } from '../../src/core/checklist';
import { moveCard } from '../../src/core/status';
import { TOOL_IDS, type Card, type ToolId } from '../../src/core/types';
import { RunService, type BoardAccess } from '../../src/runner/runService';
import { RunStore } from '../../src/runner/runStore';
import { translate } from '../../src/shared/i18n';
import { BoardRepository } from '../../src/storage/repository';

const combos = (process.env.AGENT_BOARD_SMOKE ?? '')
  .split(',')
  .filter(Boolean)
  // classify·autolink 같은 다른 스모크 이름은 건너뛴다.
  .filter((c) => c.split('+').every((t) => (TOOL_IDS as readonly string[]).includes(t)))
  .map((c) => {
    const [implementer, reviewer] = c.split('+') as [ToolId, ToolId | undefined];
    return { implementer, reviewer: reviewer ?? implementer };
  });

async function waitFor<T>(fn: () => Promise<T | undefined>, timeout = 300_000): Promise<T> {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 500));
  }
}

describe.skipIf(combos.length === 0)('real agents', () => {
  for (const { implementer: tool, reviewer } of combos) {
    it(`${tool}+${reviewer}: implement then review`, async () => {
      const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), `agent-board-smoke-${tool}-${reviewer}-`)));
      const root = path.join(tmp, 'repo');
      await fs.mkdir(root);
      const git = (...args: string[]) => execFileSync('git', args, { cwd: root });
      git('init', '-q', '-b', 'main');
      git('config', 'user.email', 't@example.com');
      git('config', 'user.name', 't');
      await fs.writeFile(path.join(root, 'README.md'), '# smoke\n');
      git('add', '.');
      git('commit', '-qm', 'init');

      const repo = new BoardRepository(root, 'en');
      await repo.init();
      const cards = new Map<string, Card>();
      const board: BoardAccess = {
        root,
        locale: 'en',
        createCard: async (title) => {
          const c = await repo.createCard({ title }, cards.size + 1);
          cards.set(c.id, c);
          return c;
        },
        t: (k, p) => translate('en', k, p),
        getCard: (id) => cards.get(id),
        allCards: () => [...cards.values()],
        saveCard: async (c) => {
          cards.set(c.id, c);
          await repo.saveCard(c);
        },
        progress: async (id) => progressOf(await repo.readTaskDoc(id, 'plan')),
        settings: () => ({ maxReviewIterations: 1, stopTimeoutSec: 10, defaultAutoReview: false }),
        enabledTools: () => ['claude', 'codex', 'cursor'],
        pages: () => [],
        sharedDocs: () => [],
        taskDocPath: (id, doc) => repo.taskDocPath(id, doc),
        moveByUser: async (id, to) => {
          const r = moveCard(cards.get(id)!, to, { now: new Date().toISOString(), hasActiveRun: false });
          await board.saveCard(r.card);
        },
        refresh: () => undefined,
        post: () => undefined,
      };
      const created = await repo.createCard({ title: 'Create hello.txt' }, 1);
      const card: Card = { ...created, agents: { implementer: { tool }, reviewer: { tool: reviewer } } };
      await board.saveCard(card);
      await repo.writeTaskDoc(card.id, 'spec', '# Spec\n\n- A file hello.txt exists at the repository root and contains exactly the word `hi`.\n');
      await repo.writeTaskDoc(card.id, 'plan', '# Plan\n\n- [ ] Create hello.txt containing `hi`\n');

      const store = new RunStore(repo.localDir);
      const service = new RunService(board, store, path.resolve('dist/hook.js'), () => ({}));
      await service.init();
      expect(service.tools().find((t) => t.id === tool)?.installed).toBe(true);
      expect(service.tools().find((t) => t.id === reviewer)?.installed).toBe(true);

      await service.startRun(card.id, 'implementer', { resume: false });
      const impl = await waitFor(async () =>
        (await store.loadRuns()).runs.find((r) => r.role === 'implementer' && ['ended', 'error', 'input_required'].includes(r.status) && r.diff !== undefined || r.status === 'error'),
      );
      console.log(tool, 'implementer', impl.status, impl.toolSessionId, impl.statusDetail, impl.changes, impl.summary?.slice(0, 300));
      const worktree = path.resolve(root, cards.get(card.id)!.workspace!.worktree!);
      expect(impl.status).not.toBe('error');
      expect(impl.toolSessionId).toBeTruthy();
      expect(existsSync(path.join(worktree, 'hello.txt'))).toBe(true);
      console.log(tool, 'progress', await board.progress(card.id));

      await service.handle({ type: 'requestReview', dir: card.id });
      const review = await waitFor(async () =>
        (await store.loadRuns()).runs.find((r) => r.role === 'reviewer' && ['ended', 'error', 'input_required'].includes(r.status)),
      );
      await new Promise((r) => setTimeout(r, 1500));
      const final = (await store.loadRuns()).runs.find((r) => r.runId === review.runId)!;
      console.log(tool, 'reviewer', final.status, final.statusDetail, JSON.stringify(final.review), final.summary?.slice(-400));
      expect(final.status).not.toBe('error');
      expect(final.review).toBeDefined();
      // 리뷰어는 파일을 바꾸지 않는다 (W-3).
      expect(execFileSync('git', ['status', '--porcelain'], { cwd: worktree }).toString()).toContain('hello.txt');
      console.log(tool, 'card status', cards.get(card.id)!.status);
      if (final.review?.verdict === 'pass') expect(cards.get(card.id)!.status).toBe('done');
      service.dispose();
    });
  }
});
