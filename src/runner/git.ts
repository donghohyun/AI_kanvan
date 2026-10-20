// worktree와 코드 버전 (W-1, A-3).

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { localDate } from '../core/board';

const MAX_BUFFER = 64 * 1024 * 1024;
export const MAX_DIFF_CHARS = 200_000;

export function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd, maxBuffer: MAX_BUFFER }, (err, stdout, stderr) => {
      if (err) reject(new Error(`git ${args.join(' ')}: ${stderr.trim() || err.message}`));
      else resolve(stdout);
    });
  });
}

export async function branchExists(repo: string, branch: string): Promise<boolean> {
  try {
    await git(repo, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]);
    return true;
  } catch {
    return false;
  }
}

/** 기본 이름: 브랜치 `task/<ID>`, worktree `../<레포 이름>-worktrees/<ID>` (W-1). 반환값은 레포 루트 기준 상대 경로. */
export function defaultWorkspace(repoRoot: string, cardId: string): { branch: string; worktree: string } {
  const worktree = path.join('..', `${path.basename(repoRoot)}-worktrees`, cardId);
  return { branch: `task/${cardId}`, worktree: worktree.split(path.sep).join('/') };
}

export async function createWorktree(repoRoot: string, worktreeRel: string, branch: string): Promise<void> {
  const target = path.resolve(repoRoot, worktreeRel);
  await fs.mkdir(path.dirname(target), { recursive: true });
  // 이전에 지워진 worktree 기록이 남아 있으면 정리한다.
  await git(repoRoot, ['worktree', 'prune']);
  if (await branchExists(repoRoot, branch)) await git(repoRoot, ['worktree', 'add', target, branch]);
  else await git(repoRoot, ['worktree', 'add', '-b', branch, target]);
}

export async function headCommit(cwd: string): Promise<string | undefined> {
  try {
    return (await git(cwd, ['rev-parse', 'HEAD'])).trim();
  } catch {
    return undefined;
  }
}

async function untrackedFiles(cwd: string): Promise<string[]> {
  return (await git(cwd, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean);
}

/**
 * 현재 코드 버전. 커밋되지 않은 변경이 있으면 diff와 새 파일 내용의 해시를 붙인다 (A-3).
 */
export async function codeRef(cwd: string): Promise<string | undefined> {
  const head = await headCommit(cwd);
  if (!head) return undefined;
  const diff = await git(cwd, ['diff', 'HEAD', '--binary']);
  const untracked = await untrackedFiles(cwd);
  if (!diff && untracked.length === 0) return head;
  const hash = createHash('sha256').update(diff);
  for (const f of untracked.sort()) {
    hash.update(`\0${f}\0`);
    hash.update(await fs.readFile(path.join(cwd, f)).catch(() => Buffer.alloc(0)));
  }
  return `${head}+${hash.digest('hex').slice(0, 16)}`;
}

/** base 이후 변경된 파일과 diff. 새 파일도 포함한다. */
export async function changesSince(cwd: string, base: string | undefined): Promise<{ files: string[]; diff: string }> {
  const ref = base ?? 'HEAD';
  const tracked = (await git(cwd, ['diff', '--name-only', ref])).split('\n').filter(Boolean);
  const untracked = await untrackedFiles(cwd);
  let diff = await git(cwd, ['diff', ref]);
  if (diff.length > MAX_DIFF_CHARS) diff = `${diff.slice(0, MAX_DIFF_CHARS)}\n… (truncated)`;
  return { files: [...new Set([...tracked, ...untracked])], diff };
}

export async function mergeBase(cwd: string, other: string): Promise<string | undefined> {
  try {
    return (await git(cwd, ['merge-base', 'HEAD', other])).trim();
  } catch {
    return undefined;
  }
}

export async function isTracked(cwd: string, rel: string): Promise<boolean> {
  try {
    await git(cwd, ['ls-files', '--error-unmatch', '--', rel]);
    return true;
  } catch {
    return false;
  }
}

/** 이 기기에서만 무시할 경로를 `.git/info/exclude`에 넣는다. worktree는 같은 파일을 함께 쓴다. */
export async function addToExclude(cwd: string, patterns: string[]): Promise<void> {
  const common = path.resolve(cwd, (await git(cwd, ['rev-parse', '--git-common-dir'])).trim());
  const file = path.join(common, 'info', 'exclude');
  const current = await fs.readFile(file, 'utf8').catch(() => '');
  const lines = new Set(current.split(/\r?\n/).map((l) => l.trim()));
  const missing = patterns.filter((p) => !lines.has(p));
  if (missing.length === 0) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  const prefix = current.length === 0 || current.endsWith('\n') ? '' : '\n';
  await fs.appendFile(file, `${prefix}${missing.join('\n')}\n`, 'utf8');
}

export interface DocHistory {
  /** 레포 루트에 체크아웃된 브랜치. Git이 아니거나 detached면 없다 */
  branch?: string;
  /** 경로 → 마지막 변경일 `YYYY-MM-DD` */
  dates: Record<string, string>;
}

/** 공용 문서 표의 일자·브랜치 (D-2). 커밋되지 않은 변경이 있거나 Git 밖 파일이면 파일 수정일을 쓴다. */
export async function docHistory(root: string, rels: string[]): Promise<DocHistory> {
  const branch = await git(root, ['branch', '--show-current']).then((s) => s.trim() || undefined, () => undefined);
  const dirty = new Set<string>();
  if (rels.length > 0) {
    const status = await git(root, ['status', '--porcelain', '-z', '--untracked-files=all', '--', ...rels]).catch(() => undefined);
    if (status === undefined) rels.forEach((r) => dirty.add(r));
    else for (const entry of status.split('\0')) if (entry.length > 3) dirty.add(entry.slice(3));
  }
  const dates: Record<string, string> = {};
  await Promise.all(
    rels.map(async (rel) => {
      const committed = dirty.has(rel)
        ? ''
        : await git(root, ['log', '-1', '--date=format-local:%Y-%m-%d', '--format=%cd', '--', rel]).then((s) => s.trim(), () => '');
      if (committed) dates[rel] = committed;
      else {
        const stat = await fs.stat(path.join(root, rel)).catch(() => undefined);
        if (stat) dates[rel] = localDate(stat.mtime);
      }
    }),
  );
  return { branch, dates };
}
