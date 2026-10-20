import { describe, expect, it } from 'vitest';
import { canvasTemplate } from '../../src/extension/canvasController';
import { compileCanvas } from '../../src/runner/canvas';
import { computeDAGLayout } from '../../src/webview/canvas/dag';

describe('compileCanvas (CV-1, CV-2)', () => {
  it('turns TSX into CommonJS that requires cursor/canvas', () => {
    const r = compileCanvas('import { Stack, Text } from "cursor/canvas";\nconst n: number = 1;\nexport default function A() { return <Stack><Text>{n}</Text></Stack>; }');
    expect('code' in r && r.code).toContain("require('cursor/canvas')");
    expect('code' in r && r.code).toContain('exports.default');
  });

  it('reports syntax errors with a line number', () => {
    const r = compileCanvas('import { Text } from "cursor/canvas";\nexport default function A() {\n  return <Text>oops</Text>\n  const = 1;\n}');
    expect(r).toMatchObject({ line: 4 });
  });

  it('rejects modules other than cursor/canvas and react', () => {
    // 쓰지 않는 import는 TypeScript 규칙대로 지워지므로, 실제로 쓰는 경우만 막는다.
    const r = compileCanvas('import fs from "fs";\nexport default function A() { return fs.readFileSync("x"); }');
    expect('error' in r && r.error).toContain('fs');
    expect(compileCanvas('import type { ReactNode } from "react";\nexport default function A(): ReactNode { return null; }')).toHaveProperty('code');
  });

  it('compiles the empty-canvas template', () => {
    expect(compileCanvas(canvasTemplate('로그인 <구현>', '설명 "따옴표"'))).toHaveProperty('code');
  });
});

describe('computeDAGLayout (CV-3)', () => {
  const nodes = ['feature', 'dev', 'prd', 'eks_dev', 'eks_prd'].map((id) => ({ id }));
  const edges = [
    { from: 'feature', to: 'dev' },
    { from: 'dev', to: 'prd' },
    { from: 'dev', to: 'eks_dev' },
    { from: 'prd', to: 'eks_prd' },
  ];

  it('ranks by longest path and centres each rank (vertical)', () => {
    const r = computeDAGLayout({ nodes, edges, nodeWidth: 100, nodeHeight: 40, rankGap: 50, nodeGap: 20, padding: 10 });
    const rank = Object.fromEntries(r.nodes.map((n) => [n.id, n.rank]));
    expect(rank).toEqual({ feature: 0, dev: 1, prd: 2, eks_dev: 2, eks_prd: 3 });
    expect(r.width).toBe(10 * 2 + 100 * 2 + 20);
    expect(r.height).toBe(10 * 2 + 40 * 4 + 50 * 3);
    const dev = r.nodes.find((n) => n.id === 'dev')!;
    expect(dev.x).toBe(10 + (220 - 100) / 2);
    const e = r.edges.find((x) => x.from === 'feature')!;
    expect([e.sourceY, e.targetY]).toEqual([10 + 40, 10 + 90]);
    expect(r.ranks.map((x) => x.nodeIds.length)).toEqual([1, 1, 2, 1]);
  });

  it('flags back edges and still lays out cycles', () => {
    const r = computeDAGLayout({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }] });
    expect(r.edges.map((e) => e.isBackEdge)).toEqual([false, false, true]);
    expect(r.nodes.map((n) => n.rank)).toEqual([0, 1, 2]);
  });

  it('lays out left to right when horizontal', () => {
    const r = computeDAGLayout({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ from: 'a', to: 'b' }], direction: 'horizontal', nodeWidth: 80, nodeHeight: 30, rankGap: 40, padding: 0 });
    const [a, b] = r.nodes;
    expect(b!.x - a!.x).toBe(120);
    expect(r.edges[0]).toMatchObject({ sourceX: 80, targetX: 120, sourceY: 15, targetY: 15 });
  });

  it('ignores edges to unknown nodes', () => {
    expect(computeDAGLayout({ nodes: [{ id: 'a' }], edges: [{ from: 'a', to: 'zzz' }] }).edges).toEqual([]);
  });
});

describe('markdown documents (all documents in canvas style)', async () => {
  const { parseMarkdown, documentBlocks, splitTag } = await import('../../src/webview/canvas/markdownParse');
  const { sharedDocKind } = await import('../../src/extension/canvasController');

  it('parses headings, lists, task lists, tables, code, quotes and rules', () => {
    const md = ['# Title', '', 'Para one', 'continues.', '', '- a', '  - b', '- [x] done', '', '| A | B |', '| :-- | --: |', '| 1 | 2 \\| 3 |', '', '```ts', 'x < 1', '```', '> note', '---'].join('\n');
    expect(parseMarkdown(md).map((b) => b.kind)).toEqual(['heading', 'paragraph', 'list', 'table', 'code', 'quote', 'rule']);
    const [, para, list, table] = parseMarkdown(md);
    expect(para).toEqual({ kind: 'paragraph', text: 'Para one continues.' });
    expect(list).toMatchObject({ items: [{ text: 'a', depth: 0 }, { text: 'b', depth: 1 }, { text: 'done', checked: true }] });
    expect(table).toMatchObject({ headers: ['A', 'B'], rows: [['1', '2 | 3']], align: [undefined, 'right'] });
  });

  it('drops the title, empty template sections and demotes headings', () => {
    const md = '# TASK-1 t — Intent\n\n## 목적\n\n## 배경\n\n내용\n\n## 범위\n';
    expect(documentBlocks(md, { skipTitle: true, demote: 1 })).toEqual([
      { kind: 'heading', level: 3, text: '배경' },
      { kind: 'paragraph', text: '내용' },
    ]);
  });

  it('splits plan tags from headings', () => {
    expect(splitTag('[BE] 로그인 API')).toEqual({ tag: 'BE', title: '로그인 API' });
    expect(splitTag('그냥 제목')).toEqual({ title: '그냥 제목' });
  });

  it('opens canvas and markdown shared docs in the board', () => {
    expect(sharedDocKind('docs/api.canvas.tsx')).toBe('canvas');
    expect(sharedDocKind('docs/ERD.md')).toBe('markdown');
    expect(sharedDocKind('docs/erd.png')).toBeUndefined();
  });
});
