import {
  Callout,
  Card,
  CardBody,
  CardHeader,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Row,
  Stack,
  Stat,
  Table,
  Text,
  computeDAGLayout,
  useHostTheme,
} from "cursor/canvas";

// Agent Board API 명세서. 확장 프로그램을 고치거나 다른 도구·스크립트를 보드와 연동하는 개발자와 에이전트를 위한 문서다.

function Block({ children }: { children: string }) {
  const t = useHostTheme();
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 8,
        background: t.fill.quaternary,
        border: `1px solid ${t.stroke.tertiary}`,
        color: t.text.primary,
        fontSize: 12,
        lineHeight: "18px",
        overflowX: "auto",
        fontFamily: "var(--vscode-editor-font-family, monospace)",
      }}
    >
      {children}
    </pre>
  );
}

const FLOW_NODES = [
  { id: "agent", label: "Claude · Codex · Cursor", note: "에이전트 도구" },
  { id: "hook", label: "hook.js", note: "3절 Hook" },
  { id: "inbox", label: "local/inbox/*.json", note: "3.3 inbox" },
  { id: "core", label: "코어 · 실행 관리", note: "4절 공통 이벤트" },
  { id: "files", label: ".agent-board/", note: "1절 저장 파일" },
  { id: "webview", label: "보드 화면", note: "5절 웹뷰 메시지" },
  { id: "outbox", label: "local/outbox/*.json", note: "3.4 세션 알림" },
];
const FLOW_EDGES = [
  { from: "agent", to: "hook", label: "stdin JSON" },
  { from: "hook", to: "inbox", label: "파일" },
  { from: "inbox", to: "core", label: "AgentEvent" },
  { from: "core", to: "files", label: "카드 · 회차" },
  { from: "files", to: "webview", label: "state" },
  { from: "core", to: "outbox", label: "알림" },
  { from: "outbox", to: "hook", label: "additionalContext" },
];

function InterfaceFlow() {
  const t = useHostTheme();
  const W = 190;
  const H = 46;
  const layout = computeDAGLayout({ nodes: FLOW_NODES, edges: FLOW_EDGES, nodeWidth: W, nodeHeight: H, rankGap: 44, nodeGap: 36, padding: 16 });
  const byId = new Map(FLOW_NODES.map((n) => [n.id, n]));
  const labels = new Map(FLOW_EDGES.map((e) => [`${e.from}-${e.to}`, e.label]));
  return (
    <svg width={layout.width} height={layout.height} role="img" aria-label="Agent Board 인터페이스 흐름" style={{ maxWidth: "100%" }}>
      <defs>
        <marker id="api-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={t.stroke.primary} />
        </marker>
      </defs>
      {layout.edges.map((e) => {
        const back = e.isBackEdge;
        const mx = (e.sourceX + e.targetX) / 2;
        const my = (e.sourceY + e.targetY) / 2;
        const d = back
          ? `M${e.sourceX + W / 2},${e.sourceY - H / 2} C${e.sourceX + W / 2 + 70},${e.sourceY - H / 2} ${e.targetX + W / 2 + 70},${e.targetY + H / 2} ${e.targetX + W / 2},${e.targetY + H / 2}`
          : `M${e.sourceX},${e.sourceY} L${e.targetX},${e.targetY}`;
        return (
          <g key={`${e.from}-${e.to}`}>
            <path d={d} fill="none" stroke={t.stroke.primary} strokeDasharray={back ? "4 3" : undefined} markerEnd="url(#api-arrow)" />
            <text x={back ? Math.max(e.sourceX, e.targetX) + W / 2 + 46 : mx + 6} y={back ? my : my + 4} fontSize={11} fill={t.text.tertiary}>
              {labels.get(`${e.from}-${e.to}`)}
            </text>
          </g>
        );
      })}
      {layout.nodes.map((n) => {
        const node = byId.get(n.id)!;
        return (
          <g key={n.id}>
            <rect x={n.x} y={n.y} width={W} height={H} rx={6} fill={t.fill.secondary} stroke={t.stroke.secondary} />
            <text x={n.x + W / 2} y={n.y + 19} textAnchor="middle" fontSize={12} fontWeight={590} fill={t.text.primary}>
              {node.label}
            </text>
            <text x={n.x + W / 2} y={n.y + 35} textAnchor="middle" fontSize={11} fill={t.text.tertiary}>
              {node.note}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function ApiSpec() {
  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <Text size="small" tone="tertiary">
          공용 문서 · API 명세서 · 요구사항은 `spec.md`, canvas 작성법은 `docs/canvas-guide.md`
        </Text>
        <H1>Agent Board API 명세서</H1>
        <Text tone="secondary">
          Agent Board가 밖으로 드러내는 인터페이스를 정리한다. 보드는 서버 없이 레포 안의 파일로 동작한다. 사람·에이전트·Git은 `.agent-board/` 파일을 읽고 쓰고, 에이전트 도구는 Hook 스크립트가 남기는 파일로 이벤트를 전하고 알림을 받는다.
        </Text>
      </Stack>

      <Grid columns={4} gap={16}>
        <Stat value="파일" label="저장 · Hook · 알림 모두 파일로 주고받음" tone="info" />
        <Stat value="6" label="VS Code 명령" />
        <Stat value="9" label="공통 이벤트 종류" />
        <Stat value="3" label="연동 도구: Claude · Codex · Cursor" />
      </Grid>

      <Callout tone="info" title="경계">
        공유 파일(`board.json`·`card.json`·작업 문서·`canvas.tsx`)에는 절대 경로·세션 ID·PID 같은 기기별 값을 쓰지 않는다. 기기별 값은 Git이 무시하는 `.agent-board/local/`에만 둔다.
      </Callout>

      <Stack gap={10}>
        <H2>인터페이스 흐름</H2>
        <Text tone="secondary">
          에이전트 이벤트는 Hook → inbox → 코어를 거쳐 카드에 반영되고, 보드가 세션에 전할 말은 outbox → Hook 출력으로 돌아간다. 점선은 되돌아가는 경로다.
        </Text>
        <InterfaceFlow />
      </Stack>

      <Divider />

      <Stack gap={12}>
        <H2>1. 저장 파일</H2>
        <Text tone="secondary">모든 경로는 레포 루트 기준. 쓰기는 임시 파일에 쓴 뒤 바꿔치기하므로 도중에 끊겨도 기존 파일이 깨지지 않는다.</Text>
        <H3>Git으로 공유하는 파일</H3>
        <Table
          headers={["경로", "내용"]}
          rows={[
            ["`.agent-board/board.json`", "보드 설정 (스키마 2)"],
            ["`.agent-board/tasks/<ID>/card.json`", "카드 메타데이터"],
            ["`.agent-board/tasks/<ID>/intent.md` · `spec.md` · `plan.md`", "작업 문서"],
            ["`.agent-board/tasks/<ID>/canvas.tsx`", "카드 문서 (6절). 없으면 보드가 작업 문서로 기본 문서를 그린다"],
            ["`.agent-board/deleted/<ID>`", "삭제한 작업 ID. 같은 번호를 다시 쓰지 않는다"],
          ]}
        />
        <Grid columns={2} gap={16}>
          <Card>
            <CardHeader trailing="스키마 2">board.json</CardHeader>
            <CardBody>
              <Table
                framed={false}
                headers={["필드", "설명"]}
                rows={[
                  ["`sharedDocs`", "`{ id, name, category, path, tags? }[]` 공용 문서. category: api·convention·erd·architecture·other, tags: 보드 구분 태그"],
                  ["`categories`", "`{ tag, name, color }[]` 항목 구분. tag는 바꾸지 않음"],
                  ["`enabledTools`", "이 보드에서 쓸 도구 (`claude`·`codex`·`cursor`)"],
                  ["`settings`", "`maxReviewIterations` 1~10, `stopTimeoutSec` 2~120, `defaultAutoReview`"],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader trailing="카드마다">card.json</CardHeader>
            <CardBody>
              <Table
                framed={false}
                headers={["필드", "설명"]}
                rows={[
                  ["`id` · `title` · `description`", "`TASK-<n>`, 폴더 이름과 같음"],
                  ["`status` · `statusVersion`", "칸반 상태와 변경 횟수. 늦게 온 실행 결과가 사용자의 이동을 덮지 않게 함"],
                  ["`agents`", "`implementer` · `reviewer`: `{ tool, options? }`"],
                  ["`workspace`", "`{ branch, worktree }` worktree는 상대 경로"],
                  ["`startDate` · `dueDate` · `dependsOn` · `doneAt`", "일정, 선행 카드, 완료 시각"],
                  ["`order` · `relatedDocs` · `autoReview` · `manualDone`", "정렬 값, 관련 공용 문서, 자동 리뷰, 수동 완료 기록"],
                ]}
              />
            </CardBody>
          </Card>
        </Grid>
        <H3>plan.md 체크리스트 규칙</H3>
        <Text>
          `- [ ]`·`- [x]` 항목(중첩 포함, 코드 블록 제외)으로 진행률을 센다. 제목이 `[태그]`로 시작하면 그 절의 항목은 해당 구분에 속한다. 예: `## [BE] 로그인 API`. 태그 없는 제목은 상위 제목의 태그를 따르고, 없거나 보드에 없는 태그는 미분류다.
        </Text>
        <H3>이 기기에만 두는 파일 (`.agent-board/local/`)</H3>
        <Table
          headers={["경로", "내용"]}
          rows={[
            ["`runs.json` · `events.jsonl`", "실행 회차 스냅샷과 이벤트 로그. 시작할 때 로그를 다시 적용해도 결과가 같다"],
            ["`sessions.json` · `unlinked.json`", "카드 → 역할 → 세션 연결, 카드를 정하지 못한 세션"],
            ["`runs/<ID>/<회차>.jsonl` · `.prompt.md`", "에이전트 출력 원문과 보낸 프롬프트"],
            ["`inbox/` · `outbox/`", "Hook 이벤트와 세션 알림 (3절)"],
            ["`hook.js` · `hooks.json`", "Hook 스크립트 사본, 설치한 도구"],
            ["`canvas-state/<ID>.json` · `backup/`", "canvas 상태, 마이그레이션 전 원본"],
          ]}
        />
      </Stack>

      <Divider />

      <Stack gap={12}>
        <H2>2. VS Code 명령과 설정</H2>
        <Grid columns={2} gap={16}>
          <Table
            headers={["명령 ID", "이름"]}
            rows={[
              ["`agentBoard.open`", "보드 열기"],
              ["`agentBoard.createCard`", "카드 만들기"],
              ["`agentBoard.renumberCard`", "카드 ID 변경"],
              ["`agentBoard.installHooks`", "에이전트 세션 Hook 설치"],
              ["`agentBoard.detectTools`", "에이전트 CLI 다시 찾기"],
              ["`agentBoard.openSettings`", "설정 열기"],
            ]}
          />
          <Table
            headers={["설정 (사용자 설정)", "값", "기본"]}
            rows={[
              ["`agentBoard.toolPaths`", "`{ claude?, codex?, cursor? }`", "PATH에서 찾음"],
              ["`agentBoard.autoCreateCards`", "boolean", "`true`"],
              ["`agentBoard.matcherTool`", "auto·claude·codex·cursor·none", "`auto`"],
            ]}
          />
        </Grid>
      </Stack>

      <Divider />

      <Stack gap={12}>
        <H2>3. Hook 인터페이스</H2>
        <Text>에이전트 도구는 Hook마다 아래 명령을 실행하고 이벤트 JSON을 stdin으로 넘긴다. 네트워크 없이 파일로만 주고받으므로, 확장 프로그램이 꺼져 있을 때 받은 이벤트도 다음에 열 때 반영된다.</Text>
        <Block>{"AGENT_BOARD_HOOK=1 <node> <레포>/.agent-board/local/hook.js <tool> <레포>/.agent-board/local/inbox"}</Block>
        <Text size="small" tone="tertiary">
          `node`는 설치 시점에 찾은 절대 경로이고, 없으면 `ELECTRON_RUN_AS_NODE=1`과 에디터 실행 파일을 쓴다. `AGENT_BOARD_HOOK=1`이 있는 항목만 다시 설치할 때 교체한다.
        </Text>
        <H3>설치 위치와 이벤트</H3>
        <Table
          headers={["도구", "파일", "이벤트"]}
          rows={[
            ["Claude Code", "`.claude/settings.local.json`", "SessionStart · UserPromptSubmit · PostToolUse · Notification · PermissionRequest · Stop · StopFailure · SessionEnd"],
            ["Codex", "`.codex/hooks.json`", "SessionStart · UserPromptSubmit · PostToolUse · PermissionRequest · Stop · Interrupt · SessionEnd"],
            ["Cursor", "`.cursor/hooks.json`", "sessionStart · beforeSubmitPrompt · afterFileEdit · postToolUse · stop · sessionEnd"],
          ]}
        />
        <Text size="small" tone="tertiary">레포 루트와 각 카드 worktree에 설치하고 `.git/info/exclude`에 추가한다. 이미 Git이 추적하는 파일은 건드리지 않는다.</Text>
        <H3>환경 변수</H3>
        <Table
          headers={["변수", "설정하는 쪽", "뜻"]}
          rows={[
            ["`AGENT_BOARD_CARD_ID` · `AGENT_BOARD_RUN_ID`", "보드가 띄운 에이전트", "이벤트가 속한 카드와 회차"],
            ["`AGENT_BOARD_INTERNAL=1`", "카드 판단용 CLI", "이 세션의 이벤트는 카드로 만들지 않는다"],
          ]}
        />
        <Grid columns={2} gap={16}>
          <Stack gap={8}>
            <H3>inbox 파일</H3>
            <Text size="small" tone="secondary">{"`inbox/<수신시각 ms 15자리>-<hrtime>-<임의값>.json`. 이름 순서가 수신 순서이고, 처리하면 지운다."}</Text>
            <Block>{`{
  "tool": "claude",
  "receivedAt": "2026-10-20T05:16:07.489Z",
  "runId": "1",
  "cardId": "TASK-2",
  "internal": true,
  "input": { "hook_event_name": "UserPromptSubmit",
             "session_id": "…", "cwd": "…", "prompt": "…" }
}`}</Block>
          </Stack>
          <Stack gap={8}>
            <H3>outbox (세션 알림)</H3>
            <Text size="small" tone="secondary">{'`outbox/<tool>-<세션 ID>.json`에 `{ "messages": [] }`로 쌓고, 맥락을 넣을 수 있는 이벤트에서 한 번에 출력한 뒤 지운다.'}</Text>
            <Table
              headers={["도구", "이벤트", "출력"]}
              rows={[
                ["Claude · Codex", "UserPromptSubmit · PostToolUse · SessionStart", "`hookSpecificOutput.additionalContext`"],
                ["Cursor", "postToolUse · sessionStart", "`additional_context`"],
              ]}
            />
          </Stack>
        </Grid>
      </Stack>

      <Divider />

      <Stack gap={12}>
        <H2>4. 공통 이벤트</H2>
        <Text>어댑터는 도구별 출력(headless 실행의 stream JSON, Hook 입력)을 아래 형식으로 바꾸고, 코어가 카드에 무엇을 반영할지 정한다.</Text>
        <Block>{`interface AgentEvent {
  eventId: string;     // 같은 사건이면 같은 값
  type: 'run.started' | 'turn.started' | 'file.changed' | 'response.completed'
      | 'input.required' | 'run.ended' | 'run.stopped' | 'run.failed' | 'process.lost';
  tool: 'claude' | 'codex' | 'cursor';
  toolSessionId?: string;
  cardId?: string;
  runId?: string;      // 카드마다 1부터 시작 — cardId와 함께 쓴다
  source: 'stream' | 'hook' | 'runner';
  seq: number;         // 출처별로 커지는 순번
  occurredAt: string;
  payload?: { summary, verification, changes, error, transcriptPath, cwd, idle, reason, prompt };
}`}</Block>
        <Table
          headers={["규칙", "내용"]}
          rowTone={["info", "info", "info", "neutral"]}
          rows={[
            ["중복", "이미 처리한 `eventId`는 무시"],
            ["순서", "같은 출처에서 처리한 `seq` 이하는 실행 상태를 바꾸지 않음. 종료된 회차는 다시 열지 않음"],
            ["회차 찾기", "`runId`+`cardId`, 없으면 같은 세션에서 이벤트 이전에 시작한 최근 회차"],
            ["카드를 모를 때", "카드 worktree면 그 카드, 아니면 첫 요청으로 판단해 연결하거나 만든다. 레포 밖이면 연결 대기"],
          ]}
        />
        <Row gap={8} wrap>
          <Text size="small" tone="tertiary">
            실행 상태: `waiting` · `running` · `input_required` · `stopping` · `stopped` · `ended` · `error` · `unknown`(상태 확인 필요)
          </Text>
        </Row>
      </Stack>

      <Divider />

      <Stack gap={12}>
        <H2>5. 웹뷰 메시지</H2>
        <Text>보드 화면과 확장 프로그램은 `postMessage`로 주고받는다. 타입 정의는 `src/shared/protocol.ts`.</Text>
        <CollapsibleSection title="웹뷰 → 확장 프로그램" count={7} defaultOpen>
          <Table
            headers={["분류", "메시지 type"]}
            rows={[
              ["보드 · 카드", "`ready` `init` `createCard` `updateCard` `moveCard` `deleteCard` `renumberCard` `openCardFile` `createWorktree`"],
              ["작업 문서", "`openTaskDoc` `watchDoc` `unwatchDoc` `saveDoc`(base가 다르면 충돌) `compareDoc` `toggleChecklist`"],
              ["공용 문서", "`addSharedDoc` `openSharedDoc` `renameSharedDoc` `setSharedDocCategory` `setSharedDocTags` `relinkSharedDoc` `removeSharedDoc` `createDocTask`"],
              ["실행", "`loadRuns` `startRun` `stopRun` `resolveRun` `openTranscript` `pickSession` `newSession` `linkSession` `requestReview` `installHooks` `detectTools`"],
              ["설정", "`addCategory` `updateCategory`(name·color만) `moveCategory` `deleteCategory` `setToolEnabled` `updateBoardSettings` `setMachineSetting`"],
              ["문서(canvas)", "`loadCanvas` `unwatchCanvas` `canvasState` `canvasAction` `canvasError` `openExternal` `requestCanvas` `fixCanvas` `createCanvas` `openCanvasFile`"],
              ["문서 키", "카드는 카드 ID, 공용 문서는 `shared:<문서 ID>`"],
            ]}
          />
        </CollapsibleSection>
        <CollapsibleSection title="확장 프로그램 → 웹뷰" count={6} defaultOpen>
          <Table
            headers={["type", "내용"]}
            rows={[
              ["`state`", "보드 전체 상태: 설정, 카드(진행률·구분별 진행률·실행 상태·세션·canvas 유무), 도구, Hook 설치 여부, 이 기기 설정"],
              ["`doc` · `docSaved` · `docConflict`", "작업 문서 내용, 저장 완료, 저장 충돌"],
              ["`runs`", "실행 회차 목록과 역할별 연결 세션"],
              ["`canvas`", "문서: 변환된 `code` 또는 `error`, 기본 문서용 `docs`, Markdown `markdown`, 저장된 `state`"],
              ["`showSettings`", "설정 화면으로 전환"],
              ["`settingError`", "설정 입력 검증 실패(`field`, `message`)"],
            ]}
          />
        </CollapsibleSection>
      </Stack>

      <Divider />

      <Stack gap={12}>
        <H2>6. 문서와 canvas 모듈</H2>
        <Text>
          카드와 공용 문서는 모두 canvas 스타일로 보인다. 카드는 `canvas.tsx`가 있으면 그것을, 없으면 작업 문서로 만든 기본 문서를 그린다. 공용 문서는 `.canvas.tsx`를 canvas로, `.md`를 canvas 컴포넌트로 그린다. canvas는 `cursor/canvas`와 `react`만 가져올 수 있다.
        </Text>
        <Table
          headers={["useCanvasAction", "처리"]}
          rows={[
            ["`{ type: 'openFile', path, selection? }`", "레포 안 파일만 연다"],
            ["`{ type: 'openAgent', agentId }`", "그 세션의 출력 원문을 연다"],
            ["`{ type: 'newComposerChat', userPrompt }`", "카드 구현자 에이전트에게 요청을 보낸다 (공용 문서는 해당 없음)"],
          ]}
        />
        <Callout tone="warning" title="보안">
          신뢰하지 않는 작업 공간에서는 canvas 코드를 실행하지 않는다(기본 문서·Markdown은 보인다). 링크는 http·https만 외부 브라우저로 연다.
        </Callout>
      </Stack>
    </Stack>
  );
}
