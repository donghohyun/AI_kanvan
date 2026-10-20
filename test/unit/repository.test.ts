import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boardMetrics, categoryProgress } from '../../src/core/board';
import { writeFileAtomic } from '../../src/storage/fsutil';
import { BoardRepository } from '../../src/storage/repository';
import { NotShareableError } from '../../src/storage/shareable';

let root: string;
let repo: BoardRepository;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-board-'));
  repo = new BoardRepository(root);
  await repo.init();
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('init (S-1)', () => {
  it('adds local/ to .gitignore once', async () => {
    await fs.writeFile(path.join(root, '.gitignore'), 'node_modules');
    await repo.init();
    await repo.init();
    const text = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
    expect(text).toBe('node_modules\n.agent-board/local/\n');
  });
});

describe('cards', () => {
  it('creates card.json and three docs, and restores after reload', async () => {
    const card = await repo.createCard({ title: 'Login' }, 1);
    expect(card.id).toBe('TASK-1');
    for (const f of ['card.json', 'intent.md', 'spec.md', 'plan.md']) {
      await expect(fs.access(path.join(root, '.agent-board/tasks/TASK-1', f))).resolves.toBeUndefined();
    }
    const snap = await new BoardRepository(root).load();
    expect(snap.cards.map((c) => c.card?.title)).toEqual(['Login']);
  });

  it('never reuses a deleted ID (C-6)', async () => {
    await repo.createCard({ title: 'a' }, 1);
    await repo.createCard({ title: 'b' }, 2);
    await repo.deleteCard('TASK-2', true);
    expect((await repo.createCard({ title: 'c' }, 3)).id).toBe('TASK-3');
  });

  it('keeps task docs when deleteDocs is false (C-5)', async () => {
    await repo.createCard({ title: 'a' }, 1);
    await repo.deleteCard('TASK-1', false);
    await expect(fs.access(path.join(root, '.agent-board/tasks/TASK-1/plan.md'))).resolves.toBeUndefined();
    expect((await repo.load()).cards).toEqual([]);
    expect((await repo.createCard({ title: 'b' }, 1)).id).toBe('TASK-2');
  });

  it('reports progress from plan.md', async () => {
    await repo.createCard({ title: 'a' }, 1);
    await repo.writeTaskDoc('TASK-1', 'plan', '- [x] a\n- [ ] b\n');
    expect((await repo.load()).cards[0]!.progress).toEqual({ done: 1, total: 2 });
  });
});

describe('merge handling', () => {
  it('flags conflict markers in card.json (S-7)', async () => {
    await repo.createCard({ title: 'a' }, 1);
    await fs.writeFile(
      repo.cardFile('TASK-1'),
      '{\n<<<<<<< HEAD\n  "title": "a"\n=======\n  "title": "b"\n>>>>>>> other\n}\n',
    );
    const snap = await repo.load();
    expect(snap.cards[0]!.error).toBe('conflict');
  });

  it('detects duplicate IDs and renumbers (S-6)', async () => {
    const card = await repo.createCard({ title: 'a' }, 1);
    await fs.mkdir(repo.taskDir('TASK-1-other'));
    await fs.writeFile(repo.cardFile('TASK-1-other'), JSON.stringify({ ...card, title: 'b' }));
    let snap = await repo.load();
    expect(snap.duplicates).toEqual({ 'TASK-1': ['TASK-1', 'TASK-1-other'] });
    const moved = await repo.renumberCard('TASK-1-other');
    expect(moved.id).toBe('TASK-2');
    snap = await repo.load();
    expect(snap.duplicates).toEqual({});
    expect(snap.cards.map((c) => c.card?.id).sort()).toEqual(['TASK-1', 'TASK-2']);
  });
});

describe('schema (S-2, S-3)', () => {
  it('migrates unversioned card.json and keeps a backup', async () => {
    await fs.mkdir(repo.taskDir('TASK-1'), { recursive: true });
    await fs.writeFile(repo.cardFile('TASK-1'), JSON.stringify({ id: 'TASK-1', title: 'old', status: 'todo' }));
    const snap = await repo.load();
    expect(snap.cards[0]!.card?.schemaVersion).toBe(1);
    const saved = JSON.parse(await fs.readFile(repo.cardFile('TASK-1'), 'utf8'));
    expect(saved.schemaVersion).toBe(1);
    const backups = await fs.readdir(path.join(repo.localDir, 'backup'));
    expect(backups.some((b) => b.endsWith('TASK-1-card.json'))).toBe(true);
  });

  it('allows titles and descriptions that look like paths', async () => {
    const card = await repo.createCard({ title: '/api/users 페이지네이션' }, 1);
    await expect(repo.saveCard({ ...card, description: '/health 엔드포인트 추가' })).resolves.toBeUndefined();
  });

  it('migrates board.json 1 → 2 with default categories and tools (CD-1)', async () => {
    const file = path.join(root, '.agent-board/board.json');
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, sharedDocs: [], settings: { maxReviewIterations: 5, stopTimeoutSec: 10 } }));
    const { board } = await repo.load();
    expect(board.schemaVersion).toBe(2);
    expect(board.categories.map((c) => c.tag)).toEqual(['BE', 'FE', 'Infra', 'ML']);
    expect(board.enabledTools).toEqual(['claude', 'codex', 'cursor']);
    expect(board.settings).toEqual({ maxReviewIterations: 5, stopTimeoutSec: 10, defaultAutoReview: false });
    expect(JSON.parse(await fs.readFile(file, 'utf8')).schemaVersion).toBe(2);
    expect((await fs.readdir(path.join(repo.localDir, 'backup'))).some((b) => b.endsWith('board.json'))).toBe(true);
  });

  it('loads tag progress with each card', async () => {
    await repo.createCard({ title: 'a' }, 1);
    await repo.writeTaskDoc('TASK-1', 'plan', '## [BE] api\n- [x] a\n- [ ] b\n');
    expect((await repo.load()).cards[0]!.tags).toEqual({ be: { done: 1, total: 2 } });
  });

  it('refuses absolute paths and session IDs in shared files', async () => {
    const card = await repo.createCard({ title: 'a' }, 1);
    await expect(repo.saveCard({ ...card, workspace: { worktree: '/Users/me/wt' } })).rejects.toBeInstanceOf(NotShareableError);
    await expect(repo.saveCard({ ...card, agents: { implementer: { tool: 'claude', options: { sessionId: 'x' } } } })).rejects.toBeInstanceOf(
      NotShareableError,
    );
  });
});

describe('writeFileAtomic (S-4)', () => {
  it('leaves no temp files behind', async () => {
    const file = path.join(root, 'x', 'y.json');
    await writeFileAtomic(file, '1');
    await writeFileAtomic(file, '2');
    expect(await fs.readdir(path.dirname(file))).toEqual(['y.json']);
    expect(await fs.readFile(file, 'utf8')).toBe('2');
  });
});

describe('shared docs (D-1, D-3)', () => {
  it('reports missing files', async () => {
    await fs.writeFile(path.join(root, 'api.md'), '# api');
    await repo.addSharedDoc((await repo.load()).board, { name: 'API', category: 'api', path: 'api.md' });
    expect((await repo.load()).sharedDocExists).toEqual({ 'doc-1': true });
    await fs.rm(path.join(root, 'api.md'));
    expect((await repo.load()).sharedDocExists).toEqual({ 'doc-1': false });
  });
});

describe('performance (N-1)', () => {
  it('loads a 200-card board within 1 second', async () => {
    for (let i = 0; i < 200; i += 1) {
      await repo.createCard({ title: `card ${i}` }, i);
      await repo.writeTaskDoc(`TASK-${i + 1}`, 'plan', Array.from({ length: 20 }, (_, j) => `- [${j % 2 ? 'x' : ' '}] item ${j}`).join('\n'));
    }
    const started = performance.now();
    const snap = await new BoardRepository(root).load();
    const views = snap.cards.map((c) => ({ card: c.card!, progress: c.progress, tags: c.tags }));
    boardMetrics(views);
    categoryProgress(views, snap.board.categories);
    const elapsed = performance.now() - started;
    expect(snap.cards).toHaveLength(200);
    expect(elapsed).toBeLessThan(1000);
  }, 30000);
});
