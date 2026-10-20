// 실제 Claude Code 세션의 Hook으로 카드 자동 생성과 세션 알림을 확인한다 (모델 사용량 발생).
// AGENT_BOARD_SMOKE=autolink npm run test:smoke

import { execFileSync, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADAPTERS } from '../../src/adapters';
import { progressOf } from '../../src/core/checklist';
import type { Card } from '../../src/core/types';
import { hookCommand, installHooks } from '../../src/runner/hookInstall';
import { RunService, type BoardAccess } from '../../src/runner/runService';
import { RunStore } from '../../src/runner/runStore';
import { findBinary, findExecutable } from '../../src/runner/tools';
import { translate } from '../../src/shared/i18n';
import { BoardRepository } from '../../src/storage/repository';

const enabled = (process.env.AGENT_BOARD_SMOKE ?? '').split(',').includes('autolink');

describe.skipIf(!enabled)('real hooks → auto card', () => {
  it('claude: creates a card from a hand-started session and notifies it', async () => {
    const tmp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-autolink-')));
    const root = path.join(tmp, 'repo');
    await fs.mkdir(root);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 't@example.com');
    git('config', 'user.name', 't');
    await fs.writeFile(path.join(root, 'README.md'), '# demo\n');
    git('add', '.');
    git('commit', '-qm', 'init');

    const repo = new BoardRepository(root, 'ko');
    await repo.init();
    const cards = new Map<string, Card>();
    const board: BoardAccess = {
      root,
      locale: 'ko',
      t: (k, p) => translate('ko', k, p),
      getCard: (id) => cards.get(id),
      allCards: () => [...cards.values()],
      saveCard: async (c) => {
        cards.set(c.id, c);
        await repo.saveCard(c);
      },
      progress: async (id) => progressOf(await repo.readTaskDoc(id, 'plan')),
      settings: () => ({ maxReviewIterations: 1, stopTimeoutSec: 10, defaultAutoReview: false }),
        enabledTools: () => ['claude', 'codex', 'cursor'],
      sharedDocs: () => [],
      taskDocPath: (id, doc) => repo.taskDocPath(id, doc),
      moveByUser: async () => undefined,
      createCard: async (title) => {
        const c = await repo.createCard({ title }, cards.size + 1);
        cards.set(c.id, c);
        return c;
      },
      refresh: () => undefined,
      post: () => undefined,
    };
    const store = new RunStore(repo.localDir);
    const service = new RunService(board, store, path.resolve('dist/hook.js'), () => ({}), {
      autoCreate: () => true,
      matcherTool: () => 'claude',
    });
    await service.init();

    const node = (await findExecutable(['node']))!;
    await installHooks(root, 'claude', hookCommand(node, false, path.resolve('dist/hook.js'), 'claude', store.inboxDir));
    const claude = (await findBinary(ADAPTERS.claude))!;
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.AGENT_BOARD_RUN_ID;
    delete env.AGENT_BOARD_CARD_ID;

    // 1) 사용자가 직접 연 세션처럼 실행한다.
    const first = spawnSync(claude, ['-p', 'greeting.txt 파일을 만들고 내용은 "안녕"으로 해줘', '--output-format', 'json', '--permission-mode', 'acceptEdits'], {
      cwd: root,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300_000,
    });
    const sessionId = JSON.parse(first.stdout).session_id as string;
    await service.processInbox();

    const card = [...cards.values()][0]!;
    console.log('card', JSON.stringify(card), '\nintent:', await repo.readTaskDoc(card.id, 'intent'), '\nplan:', await repo.readTaskDoc(card.id, 'plan'));
    expect(card.status).toBe('todo');
    expect(card.agents.implementer?.tool).toBe('claude');
    expect(await repo.readTaskDoc(card.id, 'intent')).toContain('greeting.txt');
    expect((await service.runs(card.id)).sessions.implementer).toContain(sessionId);

    // 2) 같은 세션을 이어서 실행하면 UserPromptSubmit Hook이 보드의 알림을 전달한다.
    const second = spawnSync(
      claude,
      ['-p', '이 세션이 연결된 Agent Board 카드 ID와 plan.md 경로를 그대로 알려줘. 다른 말은 하지 마.', '--resume', sessionId, '--output-format', 'json'],
      { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 },
    );
    const answer = JSON.parse(second.stdout).result as string;
    console.log('answer:', answer);
    expect(answer).toContain(card.id);
    expect(answer).toContain('plan.md');
    await service.processInbox();
    expect(service.runStatus(card.id).implementer).toBeDefined();
    service.dispose();
  }, 600_000);
});
