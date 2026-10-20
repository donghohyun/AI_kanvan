// `computeDAGLayout` 호환 구현 (TASK-3 CV-3). 순수 배치 계산만 하고 그리기는 canvas가 한다.
// 단계: 역방향 간선 찾기(DFS) → 최장 경로로 층 정하기 → 무게중심으로 층 안 순서 다듬기 → 좌표 계산.

export type DAGLayoutOptions = {
  nodes: Array<{ id: string }>;
  edges: Array<{ from: string; to: string }>;
  direction?: 'vertical' | 'horizontal';
  nodeWidth?: number;
  nodeHeight?: number;
  rankGap?: number;
  nodeGap?: number;
  padding?: number;
};

export type DAGLayoutNode = { id: string; x: number; y: number; rank: number; order: number };
export type DAGLayoutEdge = {
  from: string;
  to: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  isBackEdge: boolean;
};
export type DAGLayoutRank = { rank: number; x: number; y: number; width: number; height: number; nodeIds: string[] };
export type DAGLayoutResult = {
  nodes: DAGLayoutNode[];
  edges: DAGLayoutEdge[];
  ranks: DAGLayoutRank[];
  direction: 'vertical' | 'horizontal';
  width: number;
  height: number;
};

const SWEEPS = 4;

export function computeDAGLayout(options: DAGLayoutOptions): DAGLayoutResult {
  const {
    direction = 'vertical',
    nodeWidth = 160,
    nodeHeight = 40,
    rankGap = 64,
    nodeGap = 48,
    padding = 24,
  } = options;
  const ids = [...new Set(options.nodes.map((n) => n.id))];
  const known = new Set(ids);
  const edges = options.edges.filter((e) => known.has(e.from) && known.has(e.to));

  // 1. 역방향 간선: 입력 순서대로 DFS를 돌며 현재 경로로 되돌아가는 간선
  const out = new Map(ids.map((id) => [id, [] as number[]]));
  edges.forEach((e, i) => out.get(e.from)!.push(i));
  const back = new Set<number>();
  const state = new Map<string, 0 | 1 | 2>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const i of out.get(id)!) {
      const to = edges[i]!.to;
      const s = state.get(to) ?? 0;
      if (s === 1) back.add(i);
      else if (s === 0) visit(to);
    }
    state.set(id, 2);
  };
  for (const id of ids) if (!state.get(id)) visit(id);
  const forward = edges.filter((_, i) => !back.has(i));

  // 2. 층: 들어오는 간선 기준 최장 경로 (위상 순서)
  const indeg = new Map(ids.map((id) => [id, 0]));
  for (const e of forward) indeg.set(e.to, indeg.get(e.to)! + 1);
  const rank = new Map(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indeg.get(id) === 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of forward.filter((x) => x.from === id)) {
      rank.set(e.to, Math.max(rank.get(e.to)!, rank.get(id)! + 1));
      indeg.set(e.to, indeg.get(e.to)! - 1);
      if (indeg.get(e.to) === 0) queue.push(e.to);
    }
  }
  const rankCount = Math.max(0, ...rank.values()) + 1;
  const layers: string[][] = Array.from({ length: ids.length ? rankCount : 0 }, () => []);
  for (const id of ids) layers[rank.get(id)!]!.push(id);

  // 3. 층 안 순서: 이웃 층 위치의 평균(무게중심)으로 위아래를 번갈아 정렬
  const position = () => new Map(layers.flatMap((layer) => layer.map((id, i) => [id, i] as const)));
  const neighbors = (id: string, up: boolean) =>
    forward.filter((e) => (up ? e.to === id : e.from === id)).map((e) => (up ? e.from : e.to));
  for (let sweep = 0; sweep < SWEEPS; sweep += 1) {
    const up = sweep % 2 === 0;
    const range = up ? layers.keys() : [...layers.keys()].reverse();
    for (const r of range) {
      const pos = position();
      const layer = layers[r]!;
      const score = new Map(
        layer.map((id, i) => {
          const ns = neighbors(id, up);
          return [id, ns.length ? ns.reduce((s, n) => s + pos.get(n)!, 0) / ns.length : i] as const;
        }),
      );
      layer.sort((a, b) => score.get(a)! - score.get(b)! || pos.get(a)! - pos.get(b)!);
    }
  }

  // 4. 좌표: 층마다 가운데 정렬
  const vertical = direction === 'vertical';
  const along = vertical ? nodeWidth : nodeHeight; // 층 안에서 노드가 차지하는 길이
  const across = vertical ? nodeHeight : nodeWidth; // 층 방향 길이
  const widest = Math.max(0, ...layers.map((l) => l.length * along + Math.max(0, l.length - 1) * nodeGap));
  const placed = new Map<string, DAGLayoutNode>();
  const ranks: DAGLayoutRank[] = layers.map((layer, r) => {
    const span = layer.length * along + Math.max(0, layer.length - 1) * nodeGap;
    const start = padding + (widest - span) / 2;
    const depth = padding + r * (across + rankGap);
    layer.forEach((id, order) => {
      const offset = start + order * (along + nodeGap);
      placed.set(id, { id, rank: r, order, x: vertical ? offset : depth, y: vertical ? depth : offset });
    });
    return vertical
      ? { rank: r, x: start, y: depth, width: span, height: nodeHeight, nodeIds: [...layer] }
      : { rank: r, x: depth, y: start, width: nodeWidth, height: span, nodeIds: [...layer] };
  });
  const depthTotal = layers.length * across + Math.max(0, layers.length - 1) * rankGap;
  const width = 2 * padding + (vertical ? widest : depthTotal);
  const height = 2 * padding + (vertical ? depthTotal : widest);

  const layoutEdges: DAGLayoutEdge[] = edges.map((e, i) => {
    const s = placed.get(e.from)!;
    const t = placed.get(e.to)!;
    return vertical
      ? { from: e.from, to: e.to, sourceX: s.x + nodeWidth / 2, sourceY: s.y + nodeHeight, targetX: t.x + nodeWidth / 2, targetY: t.y, isBackEdge: back.has(i) }
      : { from: e.from, to: e.to, sourceX: s.x + nodeWidth, sourceY: s.y + nodeHeight / 2, targetX: t.x, targetY: t.y + nodeHeight / 2, isBackEdge: back.has(i) };
  });

  return { nodes: ids.map((id) => placed.get(id)!), edges: layoutEdges, ranks, direction, width, height };
}
