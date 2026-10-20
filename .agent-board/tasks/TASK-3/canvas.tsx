import {
  BarChart,
  Callout,
  CollapsibleSection,
  Grid,
  H1,
  H2,
  H3,
  Stack,
  Stat,
  Table,
  Text,
  TodoList,
  UsageBar,
  computeDAGLayout,
  useHostTheme,
} from "cursor/canvas";

type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";
type PlanItem = { id: string; content: string; status: TodoStatus };
type PlanSection = { tag: "BE" | "FE"; title: string; items: PlanItem[] };

// plan.md 기준. plan.md 체크는 아직 0개이며, 코드에 반영된 항목은 in_progress(검증·체크 대기)로 표시한다.
const PLAN: PlanSection[] = [
  {
    tag: "BE",
    title: "변환과 전달",
    items: [
      { id: "be1", content: "canvas.tsx를 JavaScript로 변환(sucrase), 오류 위치 포함 (CV-1, CV-8)", status: "in_progress" },
      { id: "be2", content: "파일 감시와 다시 그리기, 신뢰하지 않는 작업 공간 처리 (CV-1, CV-9)", status: "in_progress" },
      { id: "be3", content: "canvas 상태 저장(local/canvas-state), 동작 처리(openFile·openAgent·newComposerChat), 외부 링크 (CV-5, CV-6, CV-7)", status: "in_progress" },
      { id: "be4", content: "웹뷰 보안 정책에 unsafe-eval 허용 (CV-1)", status: "in_progress" },
      { id: "be5", content: "단위 테스트", status: "in_progress" },
    ],
  },
  {
    tag: "FE",
    title: "호환 컴포넌트",
    items: [
      { id: "fe1", content: "레이아웃·글자·표면·데이터 컴포넌트 (CV-3)", status: "in_progress" },
      { id: "fe2", content: "폼 컴포넌트 (CV-3)", status: "in_progress" },
      { id: "fe3", content: "차트(Bar·Line·Pie)와 DiffView (CV-3)", status: "in_progress" },
      { id: "fe4", content: "computeDAGLayout (CV-3)", status: "in_progress" },
      { id: "fe5", content: "useHostTheme·useCanvasState·useCanvasAction과 토큰 (CV-3 ~ CV-6)", status: "in_progress" },
      { id: "fe6", content: "모듈 로더와 오류 경계 (CV-2, CV-8)", status: "in_progress" },
    ],
  },
  {
    tag: "FE",
    title: "카드 화면",
    items: [
      { id: "fe7", content: "전체 화면 카드 화면과 상단 줄, 뒤로·Esc (CP-1)", status: "in_progress" },
      { id: "fe8", content: "탭 구성과 기본 탭, 선행 작업 이동 (CP-2, CP-3)", status: "in_progress" },
      { id: "fe9", content: "문서 탭: canvas 표시, 없을 때 만들기 요청, 오류 표시와 고치기 요청 (CA-2, CA-3, CV-8)", status: "in_progress" },
    ],
  },
  {
    tag: "BE",
    title: "에이전트 지원",
    items: [
      { id: "ag1", content: "canvas 작성 안내서 (CA-1)", status: "in_progress" },
      { id: "ag2", content: "문서 만들기·고치기 프롬프트와 회차 시작 (CA-2, CA-3)", status: "in_progress" },
      { id: "ag3", content: "오류를 연결된 세션에 Hook 알림으로 전달, 중복 방지 (CA-3)", status: "in_progress" },
      { id: "ag4", content: "카드 연결 알림에 canvas·안내서 경로 추가 (CA-4)", status: "pending" },
    ],
  },
  {
    tag: "BE",
    title: "검증",
    items: [
      { id: "vf1", content: "Claude·Codex가 만든 TASK-2 canvas 렌더링 확인", status: "pending" },
      { id: "vf2", content: "이 기기의 Cursor canvas 렌더링 확인", status: "pending" },
      { id: "vf3", content: "통합 테스트와 패키징", status: "pending" },
    ],
  },
];

const ALL_ITEMS = PLAN.flatMap((s) => s.items);
const count = (items: PlanItem[], status: TodoStatus) => items.filter((i) => i.status === status).length;

const REQUIREMENTS: { group: string; rows: string[][] }[] = [
  {
    group: "카드 문서 화면 (CP)",
    rows: [
      ["CP-1", "카드 클릭·Enter로 전체 화면 카드 화면. 상단에 뒤로·ID·수정일·브랜치·마감일, 뒤로·Esc로 보드 복귀"],
      ["CP-2", "탭 순서 문서·개요·Intent·Spec·Plan·실행 이력. canvas가 있으면 문서 탭, 없으면 개요 탭이 먼저"],
      ["CP-3", "선행 작업을 누르면 그 카드 화면으로 이동"],
    ],
  },
  {
    group: "Canvas 렌더링 (CV)",
    rows: [
      ["CV-1", "확장이 `canvas.tsx`를 JavaScript로 변환해 웹뷰로 전달, 파일 변경 시 1초 안에 다시 그림"],
      ["CV-2", "`cursor/canvas`와 `react`만 import 허용, 그 밖의 모듈은 오류"],
      ["CV-3", "Cursor SDK 타입 선언과 같은 이름·속성의 컴포넌트, 차트, 폼, DAG 배치, 훅, 토큰"],
      ["CV-4", "`useHostTheme()`가 VS Code 테마 색을 따르고 테마 변경 시 다시 그림"],
      ["CV-5", "`useCanvasState`는 `.agent-board/local/canvas-state/<ID>.json`에 카드별 저장"],
      ["CV-6", "`useCanvasAction`: openFile(레포 안만), openAgent, newComposerChat(구현자 실행)"],
      ["CV-7", "링크는 http·https만 외부 브라우저로"],
      ["CV-8", "변환·렌더링 오류는 문서 탭에만 표시, 보드는 계속 동작"],
      ["CV-9", "신뢰하지 않는 작업 공간에서는 canvas를 실행하지 않고 이유 표시"],
    ],
  },
  {
    group: "에이전트 지원 (CA)",
    rows: [
      ["CA-1", "canvas 작성 안내서 `docs/canvas-guide.md` 배포"],
      ["CA-2", "canvas가 없으면 \"문서 만들기 요청\" 버튼으로 구현자 회차 시작"],
      ["CA-3", "오류를 연결된 세션에 Hook 알림으로 한 번만 전달, \"고치기 요청\" 버튼도 제공"],
      ["CA-4", "카드 연결 알림(E-12)에 canvas·안내서 경로 포함"],
    ],
  },
];

const FLOW_NODES = [
  { id: "src", label: "canvas.tsx 저장" },
  { id: "trust", label: "작업 공간 신뢰 확인" },
  { id: "blocked", label: "실행 안 함 · 이유 표시" },
  { id: "compile", label: "sucrase 변환 (확장)" },
  { id: "load", label: "모듈 로더 · 오류 경계" },
  { id: "render", label: "문서 탭 렌더링" },
  { id: "error", label: "문서 탭 오류 표시" },
  { id: "notify", label: "Hook 알림 (같은 오류 1회)" },
  { id: "agent", label: "구현자 세션이 수정" },
];

const FLOW_EDGES = [
  { from: "src", to: "trust" },
  { from: "trust", to: "compile", label: "신뢰" },
  { from: "trust", to: "blocked", label: "미신뢰" },
  { from: "compile", to: "load" },
  { from: "compile", to: "error", label: "문법 오류" },
  { from: "load", to: "render" },
  { from: "load", to: "error", label: "import·실행 오류" },
  { from: "error", to: "notify" },
  { from: "notify", to: "agent" },
  { from: "agent", to: "src", label: "1초 안에 다시 그림" },
];

const ERROR_PATH = new Set(["blocked", "error", "notify", "agent"]);

function RenderFlow() {
  const t = useHostTheme();
  const W = 190;
  const H = 36;
  const layout = computeDAGLayout({ nodes: FLOW_NODES, edges: FLOW_EDGES, nodeWidth: W, nodeHeight: H, rankGap: 44, nodeGap: 36, padding: 16 });
  const labels = new Map(FLOW_NODES.map((n) => [n.id, n.label]));
  const edgeLabels = new Map(FLOW_EDGES.map((e) => [`${e.from}-${e.to}`, e.label]));
  const placed = new Map(layout.nodes.map((n) => [n.id, n]));
  const loopX = layout.width + 24;
  const width = layout.width + 160;

  return (
    <div style={{ overflowX: "auto", maxWidth: "100%" }}>
      <svg width={width} height={layout.height} role="img" aria-label="canvas 렌더링과 오류 처리 흐름">
        <defs>
          <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
            <path d="M0,0 L8,4 L0,8 z" fill={t.stroke.primary} />
          </marker>
        </defs>
        {layout.edges.map((e) => {
          const key = `${e.from}-${e.to}`;
          const label = edgeLabels.get(key);
          if (e.isBackEdge) {
            const s = placed.get(e.from)!;
            const d = placed.get(e.to)!;
            const sy = s.y + H / 2;
            const dy = d.y + H / 2;
            const sx = s.x + W;
            const dx = d.x + W;
            return (
              <g key={key}>
                <path
                  d={`M${sx},${sy} C${loopX},${sy} ${loopX},${dy} ${dx},${dy}`}
                  fill="none"
                  stroke={t.stroke.primary}
                  strokeDasharray="4 3"
                  markerEnd="url(#flow-arrow)"
                />
                {label && (
                  <text x={loopX + 4} y={(sy + dy) / 2} fontSize={11} fill={t.text.tertiary}>
                    {label}
                  </text>
                )}
              </g>
            );
          }
          return (
            <g key={key}>
              <line x1={e.sourceX} y1={e.sourceY} x2={e.targetX} y2={e.targetY} stroke={t.stroke.primary} markerEnd="url(#flow-arrow)" />
              {label && (
                <text x={(e.sourceX + e.targetX) / 2 + 6} y={(e.sourceY + e.targetY) / 2 + 4} fontSize={11} fill={t.text.tertiary}>
                  {label}
                </text>
              )}
            </g>
          );
        })}
        {layout.nodes.map((n) => (
          <g key={n.id}>
            <rect
              x={n.x}
              y={n.y}
              width={W}
              height={H}
              rx={6}
              fill={n.id === "render" ? t.fill.primary : t.fill.secondary}
              stroke={ERROR_PATH.has(n.id) ? t.category.orange : t.stroke.secondary}
            />
            <text x={n.x + W / 2} y={n.y + H / 2 + 4} textAnchor="middle" fontSize={12} fill={t.text.primary}>
              {labels.get(n.id)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function TagProgress({ tag, label }: { tag: "BE" | "FE"; label: string }) {
  const items = PLAN.filter((s) => s.tag === tag).flatMap((s) => s.items);
  const done = count(items, "completed");
  const inCode = count(items, "in_progress");
  return (
    <UsageBar
      total={items.length}
      segments={[
        { id: "done", value: done, color: "green" },
        { id: "code", value: inCode, color: "blue" },
      ]}
      topLeftLabel={`[${tag}] ${label}`}
      topRightLabel={`체크 ${done} · 코드 반영 ${inCode} · 전체 ${items.length}`}
    />
  );
}

export default function Task3Canvas() {
  const total = ALL_ITEMS.length;
  const inCode = count(ALL_ITEMS, "in_progress");
  const pending = count(ALL_ITEMS, "pending");
  const checked = count(ALL_ITEMS, "completed");

  return (
    <Stack gap={24} style={{ padding: 24, maxWidth: 1080 }}>
      <Stack gap={8}>
        <Text size="small" tone="tertiary">
          TASK-3 · 진행 중 · 브랜치 `main` · 수정 2026-10-20 · 선행 작업 TASK-2
        </Text>
        <H1>카드 문서 화면 (Canvas 호환)</H1>
        <Text tone="secondary">
          카드를 누르면 보드 대신 전체 화면 카드 화면이 열리고, 카드 폴더의 `canvas.tsx`를 Cursor `cursor/canvas`와 같은 이름·속성의 컴포넌트로 직접 렌더링한다. 문서 형식을 Cursor canvas에 맞췄기 때문에 Cursor·Claude Code·Codex 어느 에이전트든 같은 문서를 쓰고 고칠 수 있다. 호환 컴포넌트, 변환, 카드 화면은 코드에 들어왔고, 남은 일은 카드 연결 알림 보강과 실제 canvas 렌더링 검증, 패키징이다.
        </Text>
      </Stack>

      <Grid columns={4} gap={16}>
        <Stat value={`${inCode} / ${total}`} label="코드 반영된 계획 항목" tone="info" />
        <Stat value={`${checked} / ${total}`} label="plan.md 체크 완료" />
        <Stat value={pending} label="남은 항목 (검증 3 포함)" tone="warning" />
        <Stat value={16} label="요구사항 (CP 3 · CV 9 · CA 4)" />
      </Grid>

      <Grid columns={2} gap={16}>
        <Callout tone="info" title="결정 사항">
          문서 형식은 Cursor canvas 호환 `canvas.tsx`, 화면은 전체 화면 + 뒤로. Cursor 내부 코드는 쓰지 않고, 공개된 타입 선언의 이름·사용법만 맞춰 직접 구현한다. 기존 편집 탭(개요·Intent·Spec·Plan·실행 이력)은 카드 화면의 탭으로 옮긴다.
        </Callout>
        <Callout tone="warning" title="경계와 안전장치">
          신뢰하지 않는 작업 공간에서는 canvas를 실행하지 않는다. import는 `cursor/canvas`와 `react`만 허용하고, openFile은 레포 안 파일만, 링크는 http·https만 연다. 제외: 기존 `@task` canvas 가져오기, `~/.cursor` canvas 폴더 동기화, 확장 안의 TypeScript 타입 검사.
        </Callout>
      </Grid>

      <Stack gap={12}>
        <H2>렌더링과 오류 처리 흐름</H2>
        <Text size="small" tone="secondary">
          저장된 `canvas.tsx`가 문서 탭에 그려지기까지의 경로. 주황 테두리는 실행 차단·오류 경로이고, 점선은 에이전트가 고친 뒤 다시 그리는 순환이다.
        </Text>
        <RenderFlow />
      </Stack>

      <Stack gap={12}>
        <H2>범주별 진행</H2>
        <Text size="small" tone="secondary">
          plan.md 태그 기준. 이 작업에는 [BE]와 [FE] 항목만 있다. 파랑은 코드에 반영됐지만 아직 plan.md에서 체크되지 않은 항목이다.
        </Text>
        <Grid columns={2} gap={16}>
          <TagProgress tag="BE" label="백엔드" />
          <TagProgress tag="FE" label="웹뷰" />
        </Grid>
        <H3>계획 섹션별 항목 수</H3>
        <BarChart
          categories={PLAN.map((s) => `[${s.tag}] ${s.title}`)}
          series={[
            { name: "코드 반영 (체크 대기)", data: PLAN.map((s) => count(s.items, "in_progress")), tone: "info" },
            { name: "남음", data: PLAN.map((s) => count(s.items, "pending")), tone: "warning" },
          ]}
          stacked
          horizontal
          valueSuffix="개"
          height={220}
        />
      </Stack>

      <Stack gap={12}>
        <H2>요구사항</H2>
        {REQUIREMENTS.map((g) => (
          <Stack key={g.group} gap={8}>
            <H3>{g.group}</H3>
            <Table headers={["ID", "내용"]} rows={g.rows} striped />
          </Stack>
        ))}
      </Stack>

      <Stack gap={12}>
        <H2>완료 조건</H2>
        <Table
          headers={["조건", "관련 항목", "상태"]}
          rows={[
            ["카드 클릭으로 전체 화면, 뒤로·Esc로 보드 복귀", "CP-1", "구현됨, 확인 대기"],
            ["Claude Code·Codex가 만든 TASK-2 canvas 두 개가 오류 없이 렌더링", "검증", "남음"],
            ["이 기기의 기존 Cursor canvas 렌더링(지원 컴포넌트 범위)", "검증", "남음"],
            ["수정 후 1초 안에 다시 그림, 문법 오류는 문서 탭에 표시", "CV-1, CV-8", "구현됨, 확인 대기"],
            ["canvas 없는 카드에서 \"문서 만들기\"로 구현자 회차 시작", "CA-2", "구현됨, 확인 대기"],
            ["신뢰하지 않는 작업 공간에서 canvas 미실행", "CV-9", "구현됨, 확인 대기"],
          ]}
          rowTone={["info", "warning", "warning", "info", "info", "info"]}
        />
      </Stack>

      <Stack gap={12}>
        <H2>남은 일</H2>
        <Text size="small" tone="secondary">
          plan.md 섹션 순서. 진행 중 표시는 코드에 들어왔으나 검증·체크 전인 항목이다.
        </Text>
        <Stack gap={8}>
          {PLAN.map((s) => {
            const open = s.items.some((i) => i.status === "pending");
            return (
              <CollapsibleSection
                key={s.title}
                title={`[${s.tag}] ${s.title}`}
                count={s.items.length}
                trailing={
                  <Text size="small" tone={open ? "secondary" : "tertiary"}>
                    {open ? `남음 ${count(s.items, "pending")}` : "모두 코드 반영"}
                  </Text>
                }
                defaultOpen={open}
              >
                <TodoList todos={s.items} />
              </CollapsibleSection>
            );
          })}
        </Stack>
      </Stack>

      <Text size="small" tone="quaternary">
        출처: TASK-3 intent.md · spec.md · plan.md, `src/webview/canvas`, `src/extension/canvasController.ts`
      </Text>
    </Stack>
  );
}
