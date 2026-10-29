import {
  Callout,
  CollapsibleSection,
  Divider,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Table,
  Text,
  TextInput,
  computeDAGLayout,
  useCanvasState,
  useHostTheme,
  useMemo,
} from "cursor/canvas";

// Agent Board API 명세서. 확장 프로그램을 고치거나 다른 도구·스크립트를 보드와 연동하는 개발자와 에이전트를 위한 문서다.
// 접점마다 Request(무엇을 보내는가)와 Response(무엇이 돌아오는가)로 적는다. 항목은 ENTRIES 데이터에 있다.

type Field = { name: string; type: string; required: "필수" | "선택"; description: string };

type Entry = {
  group: string;
  kind: string;
  name: string;
  summary: string;
  request: string;
  requestFields?: Field[];
  response: string;
  responseFields?: Field[];
};

const GROUPS = ["VS Code 명령", "설정", "Hook", "웹뷰 → 확장 프로그램", "canvas 동작"];

const DIR: Field = { name: "dir", type: "String", required: "필수", description: "카드 ID(`TASK-1`). 문서 메시지는 공용 문서면 `shared:<문서 ID>`" };
const ROLE: Field = { name: "role", type: "implementer | reviewer", required: "필수", description: "구현자 또는 리뷰어" };
const DOC: Field = { name: "doc", type: "intent | spec | plan", required: "필수", description: "작업 문서" };
const DOC_ID: Field = { name: "id", type: "String", required: "필수", description: "공용 문서 ID(`doc-1`)" };
const TAG: Field = { name: "tag", type: "String", required: "필수", description: "구분 태그. 만든 뒤 바꾸지 않는다" };
const STATE = "확장 프로그램 → 웹뷰: { \"type\": \"state\", \"state\": BoardState }";
const NONE = "응답 메시지 없음";

const ENTRIES: Entry[] = [
  // ---- VS Code 명령 ----
  { group: "VS Code 명령", kind: "명령", name: "agentBoard.open", summary: "보드를 연다.", request: "vscode.commands.executeCommand(\"agentBoard.open\")", response: "보드 웹뷰 패널이 열린다. 보드가 없는 레포면 \"이 레포에 보드 만들기\" 화면이 보인다." },
  { group: "VS Code 명령", kind: "명령", name: "agentBoard.createCard", summary: "제목을 입력받아 Todo에 카드를 만든다.", request: "vscode.commands.executeCommand(\"agentBoard.createCard\")", response: "입력 상자 → `.agent-board/tasks/TASK-<n>/`에 card.json과 작업 문서 3종이 생긴다." },
  { group: "VS Code 명령", kind: "명령", name: "agentBoard.renumberCard", summary: "병합 뒤 ID가 겹친 카드에 새 ID를 준다.", request: "vscode.commands.executeCommand(\"agentBoard.renumberCard\")", response: "카드 선택 → 폴더 이름과 카드 ID가 다음 번호로 바뀐다." },
  { group: "VS Code 명령", kind: "명령", name: "agentBoard.installHooks", summary: "에이전트 도구에 Hook을 설치한다.", request: "vscode.commands.executeCommand(\"agentBoard.installHooks\")", response: "도구 선택 → 레포 루트와 카드 worktree의 Hook 설정 파일에 항목이 추가되고 `.git/info/exclude`에 등록된다." },
  { group: "VS Code 명령", kind: "명령", name: "agentBoard.detectTools", summary: "설치된 에이전트 CLI와 버전을 다시 찾는다.", request: "vscode.commands.executeCommand(\"agentBoard.detectTools\")", response: "보드의 도구 목록(설치 여부·버전·기능)이 갱신된다." },
  { group: "VS Code 명령", kind: "명령", name: "agentBoard.openSettings", summary: "보드를 열고 설정 화면으로 간다.", request: "vscode.commands.executeCommand(\"agentBoard.openSettings\")", response: "확장 프로그램 → 웹뷰: { \"type\": \"showSettings\" }" },

  // ---- 설정 ----
  {
    group: "설정", kind: "설정", name: "agentBoard.toolPaths", summary: "PATH에서 찾지 못하는 CLI 경로.",
    request: "// settings.json (사용자 설정)\n\"agentBoard.toolPaths\": { \"claude\": \"/opt/claude/bin/claude\" }",
    requestFields: [
      { name: "claude", type: "String", required: "선택", description: "Claude Code CLI 경로" },
      { name: "codex", type: "String", required: "선택", description: "Codex CLI 경로" },
      { name: "cursor", type: "String", required: "선택", description: "Cursor CLI(`cursor-agent`) 경로" },
    ],
    response: "값이 바뀌면 CLI를 다시 찾는다. 실행 파일이 아니면 \"CLI를 찾을 수 없음\"으로 표시된다.",
  },
  {
    group: "설정", kind: "설정", name: "agentBoard.autoCreateCards", summary: "연결되지 않은 세션의 첫 요청으로 카드를 만들거나 갱신한다.",
    request: "\"agentBoard.autoCreateCards\": true",
    requestFields: [{ name: "value", type: "Boolean", required: "선택", description: "기본 true" }],
    response: "true면 Hook으로 받은 첫 요청을 카드 판단에 보낸다. false면 연결 대기 목록에만 둔다.",
  },
  {
    group: "설정", kind: "설정", name: "agentBoard.matcherTool", summary: "요청이 어느 카드에 속하는지 판단할 CLI.",
    request: "\"agentBoard.matcherTool\": \"auto\"",
    requestFields: [{ name: "value", type: "auto | claude | codex | cursor | none", required: "선택", description: "auto는 Claude Code → Codex → Cursor 순. none은 키워드 비교만" }],
    response: "판단에 쓰는 CLI가 바뀐다. 판단 세션은 `AGENT_BOARD_INTERNAL=1`로 실행되어 카드로 만들어지지 않는다.",
  },

  // ---- Hook ----
  {
    group: "Hook", kind: "Hook", name: "공통 실행 명령", summary: "모든 Hook 이벤트에서 도구가 실행하는 명령.",
    request: "AGENT_BOARD_HOOK=1 <node> <레포>/.agent-board/local/hook.js <tool> <레포>/.agent-board/local/inbox\n# stdin: 도구가 넘기는 이벤트 JSON",
    requestFields: [
      { name: "tool", type: "claude | codex | cursor", required: "필수", description: "이벤트를 보낸 도구" },
      { name: "AGENT_BOARD_CARD_ID", type: "환경 변수", required: "선택", description: "보드가 띄운 에이전트면 카드 ID" },
      { name: "AGENT_BOARD_RUN_ID", type: "환경 변수", required: "선택", description: "보드가 띄운 에이전트면 회차 번호" },
      { name: "AGENT_BOARD_INTERNAL", type: "환경 변수", required: "선택", description: "1이면 카드 판단용 세션. 카드로 만들지 않는다" },
    ],
    response: "// inbox/<수신시각 ms 15자리>-<hrtime>-<임의값>.json\n{\n  \"tool\": \"claude\",\n  \"receivedAt\": \"2026-10-20T05:16:07.489Z\",\n  \"cardId\": \"TASK-2\",\n  \"runId\": \"1\",\n  \"internal\": true,\n  \"input\": { /* stdin JSON 그대로 */ }\n}",
    responseFields: [
      { name: "stdout", type: "JSON", required: "선택", description: "보드가 이 세션에 남긴 알림이 있고 맥락을 넣을 수 있는 이벤트일 때만 출력한다 (아래 이벤트별 Response)" },
    ],
  },
  {
    group: "Hook", kind: "Hook", name: "SessionStart · sessionStart", summary: "세션이 시작됐다.",
    request: "{\n  \"hook_event_name\": \"SessionStart\",\n  \"session_id\": \"string\",\n  \"cwd\": \"string\",\n  \"transcript_path\": \"string\"\n}",
    requestFields: [
      { name: "session_id", type: "String", required: "필수", description: "Cursor는 `conversation_id`" },
      { name: "cwd", type: "String", required: "선택", description: "카드 worktree 안이면 그 카드에 연결한다" },
    ],
    response: "{ \"hookSpecificOutput\": { \"hookEventName\": \"SessionStart\", \"additionalContext\": \"[Agent Board] …\" } }\n// Cursor: { \"additional_context\": \"[Agent Board] …\" }",
    responseFields: [{ name: "공통 이벤트", type: "run.started", required: "필수", description: "카드를 아는 세션이면 회차를 시작한다" }],
  },
  {
    group: "Hook", kind: "Hook", name: "UserPromptSubmit · beforeSubmitPrompt", summary: "사용자가 요청을 보냈다.",
    request: "{\n  \"hook_event_name\": \"UserPromptSubmit\",\n  \"session_id\": \"string\",\n  \"cwd\": \"string\",\n  \"prompt\": \"string\"\n}",
    requestFields: [{ name: "prompt", type: "String", required: "필수", description: "연결되지 않은 세션이면 이 요청으로 카드를 판단한다" }],
    response: "{ \"hookSpecificOutput\": { \"hookEventName\": \"UserPromptSubmit\", \"additionalContext\": \"[Agent Board] This session is linked to card TASK-2 …\" } }",
    responseFields: [
      { name: "공통 이벤트", type: "turn.started", required: "필수", description: "구현자면 Todo 카드를 In Progress로 옮긴다" },
      { name: "카드 판단", type: "부수 효과", required: "선택", description: "새 카드를 만들거나 기존 카드의 intent·spec·plan에 요청을 더하고 세션에 알린다" },
    ],
  },
  {
    group: "Hook", kind: "Hook", name: "PostToolUse · postToolUse · afterFileEdit", summary: "에이전트가 도구를 썼다.",
    request: "{\n  \"hook_event_name\": \"PostToolUse\",\n  \"session_id\": \"string\",\n  \"tool_name\": \"Edit\",\n  \"tool_input\": { \"file_path\": \"string\" }\n}",
    response: "{ \"hookSpecificOutput\": { \"hookEventName\": \"PostToolUse\", \"additionalContext\": \"…\" } }",
    responseFields: [{ name: "공통 이벤트", type: "file.changed", required: "선택", description: "작업 문서가 바뀌었으면 보드가 다시 읽는다" }],
  },
  {
    group: "Hook", kind: "Hook", name: "Notification · PermissionRequest", summary: "도구가 사용자 입력이나 권한을 기다린다.",
    request: "{\n  \"hook_event_name\": \"Notification\",\n  \"session_id\": \"string\",\n  \"notification_type\": \"permission_prompt\"\n}",
    response: NONE,
    responseFields: [{ name: "공통 이벤트", type: "input.required", required: "필수", description: "실행 상태가 \"사용자 입력 필요\"가 된다" }],
  },
  {
    group: "Hook", kind: "Hook", name: "Stop · stop", summary: "에이전트의 응답이 끝났다.",
    request: "{\n  \"hook_event_name\": \"Stop\",\n  \"session_id\": \"string\",\n  \"last_assistant_message\": \"string\"\n}",
    response: NONE,
    responseFields: [{ name: "공통 이벤트", type: "response.completed (idle)", required: "필수", description: "체크리스트가 모두 완료됐으면 In Progress 카드를 Review로 옮긴다" }],
  },
  {
    group: "Hook", kind: "Hook", name: "SessionEnd · sessionEnd · StopFailure · Interrupt", summary: "세션이 끝났거나 실패했다.",
    request: "{\n  \"hook_event_name\": \"SessionEnd\",\n  \"session_id\": \"string\"\n}",
    response: NONE,
    responseFields: [{ name: "공통 이벤트", type: "run.ended · run.failed · run.stopped", required: "필수", description: "회차가 끝난다. 끝난 회차는 다시 열지 않는다" }],
  },

  // ---- 웹뷰 → 확장 프로그램: 보드·카드 ----
  { group: "웹뷰 → 확장 프로그램", kind: "보드", name: "ready", summary: "웹뷰가 준비됐다.", request: "{ \"type\": \"ready\" }", response: STATE },
  { group: "웹뷰 → 확장 프로그램", kind: "보드", name: "init", summary: "이 레포에 보드를 만든다.", request: "{ \"type\": \"init\" }", response: STATE },
  {
    group: "웹뷰 → 확장 프로그램", kind: "카드", name: "createCard", summary: "Todo에 카드를 만든다.", request: "{ \"type\": \"createCard\", \"title\": \"string\" }",
    requestFields: [{ name: "title", type: "String", required: "필수", description: "빈 문자열이면 만들지 않는다" }], response: STATE,
  },
  {
    group: "웹뷰 → 확장 프로그램", kind: "카드", name: "updateCard", summary: "카드 정보를 고친다.",
    request: "{\n  \"type\": \"updateCard\",\n  \"id\": \"TASK-1\",\n  \"patch\": { \"title\": \"string\", \"dueDate\": \"2026-10-30\", \"dependsOn\": [\"TASK-2\"] }\n}",
    requestFields: [
      { name: "id", type: "String", required: "필수", description: "카드 ID" },
      { name: "patch.title · description", type: "String", required: "선택", description: "제목·설명" },
      { name: "patch.agents", type: "{ implementer?, reviewer? }", required: "선택", description: "`{ tool, options? }` 또는 null(해제)" },
      { name: "patch.startDate · dueDate", type: "YYYY-MM-DD", required: "선택", description: "빈 문자열이면 지운다. 시작일이 마감일보다 늦으면 거부" },
      { name: "patch.dependsOn", type: "String[]", required: "선택", description: "같은 보드의 선행 카드. 자기 자신·순환은 거부" },
      { name: "patch.relatedDocs · autoReview", type: "String[] · Boolean", required: "선택", description: "관련 공용 문서, 자동 수정·재리뷰" },
    ],
    response: STATE + "\n// 검증에 실패하면 경고 알림만 뜨고 저장하지 않는다",
  },
  {
    group: "웹뷰 → 확장 프로그램", kind: "카드", name: "moveCard", summary: "카드를 다른 열이나 위치로 옮긴다.",
    request: "{ \"type\": \"moveCard\", \"id\": \"TASK-1\", \"to\": \"review\", \"beforeId\": \"TASK-3\" }",
    requestFields: [
      { name: "to", type: "todo | in_progress | review | suspended | done", required: "필수", description: "옮길 열" },
      { name: "beforeId · afterId", type: "String", required: "선택", description: "이웃 카드. 없으면 열의 끝" },
    ],
    response: STATE + "\n// Done 조건이 안 맞으면 확인을 받고 manualDone에 기록한다. 실행 중 카드를 Suspended로 옮기면 실행을 멈춘다",
  },
  { group: "웹뷰 → 확장 프로그램", kind: "카드", name: "deleteCard", summary: "카드를 지운다.", request: "{ \"type\": \"deleteCard\", \"dir\": \"TASK-1\" }", requestFields: [DIR], response: STATE + "\n// 확인 후 삭제. ID는 deleted/에 남겨 다시 쓰지 않는다" },
  { group: "웹뷰 → 확장 프로그램", kind: "카드", name: "renumberCard", summary: "ID가 겹친 카드에 새 ID를 준다.", request: "{ \"type\": \"renumberCard\", \"dir\": \"TASK-1\" }", requestFields: [DIR], response: STATE },
  { group: "웹뷰 → 확장 프로그램", kind: "카드", name: "openCardFile", summary: "card.json을 에디터로 연다.", request: "{ \"type\": \"openCardFile\", \"dir\": \"TASK-1\" }", requestFields: [DIR], response: NONE },
  { group: "웹뷰 → 확장 프로그램", kind: "카드", name: "createWorktree", summary: "카드 전용 worktree와 브랜치를 만든다.", request: "{ \"type\": \"createWorktree\", \"dir\": \"TASK-1\" }", requestFields: [DIR], response: STATE + "\n// ../<레포>-worktrees/<ID>, 브랜치 task/<ID>" },

  // ---- 작업 문서 ----
  { group: "웹뷰 → 확장 프로그램", kind: "작업 문서", name: "openTaskDoc", summary: "작업 문서를 에디터로 연다.", request: "{ \"type\": \"openTaskDoc\", \"dir\": \"TASK-1\", \"doc\": \"spec\" }", requestFields: [DIR, DOC], response: NONE },
  {
    group: "웹뷰 → 확장 프로그램", kind: "작업 문서", name: "watchDoc", summary: "작업 문서 내용을 받고, 바뀔 때마다 다시 받는다.", request: "{ \"type\": \"watchDoc\", \"dir\": \"TASK-1\", \"doc\": \"plan\" }", requestFields: [DIR, DOC],
    response: "{ \"type\": \"doc\", \"dir\": \"TASK-1\", \"doc\": \"plan\", \"content\": \"string | undefined\" }\n// plan이면 { \"type\": \"checklist\", \"dir\", \"items\": ChecklistItem[] }도 보낸다",
  },
  { group: "웹뷰 → 확장 프로그램", kind: "작업 문서", name: "unwatchDoc", summary: "작업 문서 감시를 그만둔다.", request: "{ \"type\": \"unwatchDoc\", \"dir\": \"TASK-1\", \"doc\": \"plan\" }", requestFields: [DIR, DOC], response: NONE },
  {
    group: "웹뷰 → 확장 프로그램", kind: "작업 문서", name: "saveDoc", summary: "작업 문서를 저장한다.",
    request: "{ \"type\": \"saveDoc\", \"dir\": \"TASK-1\", \"doc\": \"spec\", \"content\": \"string\", \"base\": \"string\" }",
    requestFields: [DIR, DOC, { name: "content", type: "String", required: "필수", description: "새 내용" }, { name: "base", type: "String | undefined", required: "필수", description: "편집을 시작할 때의 내용. 파일이 이와 다르면 저장하지 않는다" }],
    response: "{ \"type\": \"docSaved\", \"dir\", \"doc\", \"content\" }\n// 충돌: { \"type\": \"docConflict\", \"dir\", \"doc\", \"fileContent\" }",
  },
  { group: "웹뷰 → 확장 프로그램", kind: "작업 문서", name: "compareDoc", summary: "편집 중인 내용과 파일을 비교 화면으로 연다.", request: "{ \"type\": \"compareDoc\", \"dir\": \"TASK-1\", \"doc\": \"spec\", \"content\": \"string\" }", requestFields: [DIR, DOC], response: NONE },
  {
    group: "웹뷰 → 확장 프로그램", kind: "작업 문서", name: "toggleChecklist", summary: "plan.md 체크리스트 항목을 체크하거나 해제한다.",
    request: "{ \"type\": \"toggleChecklist\", \"dir\": \"TASK-1\", \"line\": 12, \"text\": \"로그인 API\", \"checked\": true }",
    requestFields: [DIR, { name: "line", type: "Number", required: "필수", description: "항목 줄 번호" }, { name: "text", type: "String", required: "필수", description: "항목 내용. 그 줄의 내용이 다르면 바꾸지 않는다" }, { name: "checked", type: "Boolean", required: "필수", description: "새 상태" }],
    response: STATE + "\n// 줄이 바뀌었으면 안내 알림만 뜬다",
  },

  // ---- 공용 문서 ----
  { group: "웹뷰 → 확장 프로그램", kind: "공용 문서", name: "addSharedDoc", summary: "레포 안 파일을 공용 문서로 등록한다.", request: "{ \"type\": \"addSharedDoc\" }", response: STATE + "\n// 파일 선택 → 이름 → 분류 → 구분(여러 개 선택)" },
  { group: "웹뷰 → 확장 프로그램", kind: "공용 문서", name: "openSharedDoc", summary: "공용 문서를 에디터로 연다.", request: "{ \"type\": \"openSharedDoc\", \"id\": \"doc-1\" }", requestFields: [DOC_ID], response: NONE },
  { group: "웹뷰 → 확장 프로그램", kind: "공용 문서", name: "renameSharedDoc", summary: "공용 문서 이름을 바꾼다.", request: "{ \"type\": \"renameSharedDoc\", \"id\": \"doc-1\" }", requestFields: [DOC_ID], response: STATE },
  {
    group: "웹뷰 → 확장 프로그램", kind: "공용 문서", name: "setSharedDocCategory", summary: "공용 문서의 분류를 바꾼다.", request: "{ \"type\": \"setSharedDocCategory\", \"id\": \"doc-1\", \"category\": \"api\" }",
    requestFields: [DOC_ID, { name: "category", type: "api | convention | erd | architecture | other", required: "필수", description: "문서 분류" }], response: STATE,
  },
  {
    group: "웹뷰 → 확장 프로그램", kind: "공용 문서", name: "setSharedDocTags", summary: "공용 문서 표의 구분을 정한다.", request: "{ \"type\": \"setSharedDocTags\", \"id\": \"doc-1\", \"tags\": [\"BE\", \"Infra\"] }",
    requestFields: [DOC_ID, { name: "tags", type: "String[]", required: "필수", description: "보드 구분 태그. 보드에 없는 태그는 버린다" }], response: STATE,
  },
  { group: "웹뷰 → 확장 프로그램", kind: "공용 문서", name: "relinkSharedDoc", summary: "깨진 공용 문서의 경로를 다시 지정한다.", request: "{ \"type\": \"relinkSharedDoc\", \"id\": \"doc-1\" }", requestFields: [DOC_ID], response: STATE },
  { group: "웹뷰 → 확장 프로그램", kind: "공용 문서", name: "removeSharedDoc", summary: "공용 문서 등록을 해제한다. 파일은 지우지 않는다.", request: "{ \"type\": \"removeSharedDoc\", \"id\": \"doc-1\" }", requestFields: [DOC_ID], response: STATE },
  { group: "웹뷰 → 확장 프로그램", kind: "공용 문서", name: "createDocTask", summary: "이 문서를 고치는 카드를 Todo에 만든다.", request: "{ \"type\": \"createDocTask\", \"id\": \"doc-1\" }", requestFields: [DOC_ID], response: STATE },

  // ---- 실행 ----
  {
    group: "웹뷰 → 확장 프로그램", kind: "실행", name: "loadRuns", summary: "카드의 실행 회차를 받는다.", request: "{ \"type\": \"loadRuns\", \"dir\": \"TASK-1\" }", requestFields: [DIR],
    response: "{ \"type\": \"runs\", \"dir\": \"TASK-1\", \"runs\": RunView[], \"sessions\": { \"implementer\": \"…\" } }",
  },
  {
    group: "웹뷰 → 확장 프로그램", kind: "실행", name: "startRun", summary: "구현자나 리뷰어를 실행한다.", request: "{ \"type\": \"startRun\", \"dir\": \"TASK-1\", \"role\": \"implementer\", \"resume\": false }",
    requestFields: [DIR, ROLE, { name: "resume", type: "Boolean", required: "필수", description: "연결된 세션을 이어서 실행" }],
    response: "{ \"type\": \"runs\", … } 와 " + STATE + "\n// 카드 worktree에서 CLI를 headless로 실행한다. 구현자가 시작하면 Todo 카드는 In Progress로 간다",
  },
  { group: "웹뷰 → 확장 프로그램", kind: "실행", name: "stopRun", summary: "실행 중인 회차를 멈춘다.", request: "{ \"type\": \"stopRun\", \"dir\": \"TASK-1\", \"role\": \"implementer\" }", requestFields: [DIR, ROLE], response: "{ \"type\": \"runs\", … }\n// 중단 중 → 중단됨. 제한 시간이 지나면 상태 확인 필요" },
  {
    group: "웹뷰 → 확장 프로그램", kind: "실행", name: "resolveRun", summary: "상태를 알 수 없는 회차를 사용자가 정리한다.", request: "{ \"type\": \"resolveRun\", \"dir\": \"TASK-1\", \"runId\": \"3\", \"status\": \"ended\" }",
    requestFields: [DIR, { name: "runId", type: "String", required: "필수", description: "회차 번호" }, { name: "status", type: "ended | error", required: "필수", description: "정리할 상태" }], response: "{ \"type\": \"runs\", … }",
  },
  { group: "웹뷰 → 확장 프로그램", kind: "실행", name: "openTranscript", summary: "회차의 출력 원문을 연다.", request: "{ \"type\": \"openTranscript\", \"dir\": \"TASK-1\", \"runId\": \"3\" }", requestFields: [DIR], response: NONE },
  { group: "웹뷰 → 확장 프로그램", kind: "실행", name: "requestReview", summary: "카드를 Review로 옮기고 리뷰어를 실행한다.", request: "{ \"type\": \"requestReview\", \"dir\": \"TASK-1\" }", requestFields: [DIR], response: STATE + "\n// 리뷰가 통과하고 체크리스트가 끝났으면 Done으로 간다" },
  { group: "웹뷰 → 확장 프로그램", kind: "세션", name: "pickSession", summary: "도구의 기존 세션을 역할에 연결한다.", request: "{ \"type\": \"pickSession\", \"dir\": \"TASK-1\", \"role\": \"implementer\" }", requestFields: [DIR, ROLE], response: "{ \"type\": \"runs\", … }" },
  { group: "웹뷰 → 확장 프로그램", kind: "세션", name: "newSession", summary: "역할의 세션 연결을 끊어 다음 실행을 새 세션으로 한다.", request: "{ \"type\": \"newSession\", \"dir\": \"TASK-1\", \"role\": \"implementer\" }", requestFields: [DIR, ROLE], response: "{ \"type\": \"runs\", … }" },
  {
    group: "웹뷰 → 확장 프로그램", kind: "세션", name: "linkSession", summary: "연결 대기 세션을 카드와 역할에 붙인다.", request: "{ \"type\": \"linkSession\", \"tool\": \"claude\", \"sessionId\": \"string\" }",
    requestFields: [{ name: "tool", type: "claude | codex | cursor", required: "필수", description: "세션의 도구" }, { name: "sessionId", type: "String", required: "필수", description: "다른 카드에 연결된 세션이면 거부" }], response: STATE,
  },
  {
    group: "웹뷰 → 확장 프로그램", kind: "세션", name: "openSession", summary: "카드의 에이전트 칩을 눌러 그 세션을 연다.", request: "{ \"type\": \"openSession\", \"dir\": \"TASK-1\", \"tool\": \"claude\", \"sessionId\": \"string\" }",
    requestFields: [DIR, { name: "tool", type: "claude | codex | cursor", required: "필수", description: "세션의 도구" }, { name: "sessionId", type: "String", required: "필수", description: "세션 ID" }],
    response: "도구에서 연 세션: 그 도구의 채팅 화면(Claude Code·Codex 확장, Cursor 채팅)\n보드가 실행한 세션: 카드 worktree 터미널에서 `--resume`\n보드가 실행 중인 세션: 열지 않고 안내",
  },
  { group: "웹뷰 → 확장 프로그램", kind: "도구", name: "installHooks", summary: "Hook 설치 명령과 같다.", request: "{ \"type\": \"installHooks\" }", response: STATE },
  { group: "웹뷰 → 확장 프로그램", kind: "도구", name: "detectTools", summary: "CLI를 다시 찾는다.", request: "{ \"type\": \"detectTools\" }", response: STATE },

  // ---- 설정 화면 ----
  {
    group: "웹뷰 → 확장 프로그램", kind: "설정", name: "addCategory", summary: "구분을 추가한다.", request: "{ \"type\": \"addCategory\", \"tag\": \"QA\", \"name\": \"품질\", \"color\": \"green\" }",
    requestFields: [TAG, { name: "name", type: "String", required: "필수", description: "보드에 보이는 이름" }, { name: "color", type: "blue | purple | mauve | orange | green | teal | red | yellow", required: "필수", description: "구분 색" }],
    response: STATE + "\n// 검증 실패: { \"type\": \"settingError\", \"field\": \"tag\", \"message\": \"…\" }",
  },
  {
    group: "웹뷰 → 확장 프로그램", kind: "설정", name: "updateCategory", summary: "구분의 이름이나 색을 바꾼다.", request: "{ \"type\": \"updateCategory\", \"tag\": \"BE\", \"name\": \"백엔드\" }",
    requestFields: [TAG, { name: "name · color", type: "String", required: "선택", description: "태그는 바꿀 수 없다" }], response: STATE,
  },
  { group: "웹뷰 → 확장 프로그램", kind: "설정", name: "moveCategory", summary: "구분 순서를 바꾼다.", request: "{ \"type\": \"moveCategory\", \"tag\": \"BE\", \"offset\": 1 }", requestFields: [TAG, { name: "offset", type: "-1 | 1", required: "필수", description: "위·아래" }], response: STATE },
  { group: "웹뷰 → 확장 프로그램", kind: "설정", name: "deleteCategory", summary: "구분을 지운다. plan.md는 바꾸지 않는다.", request: "{ \"type\": \"deleteCategory\", \"tag\": \"ML\" }", requestFields: [TAG], response: STATE + "\n// 이 태그를 쓰는 항목 수를 보여 주고 확인을 받는다" },
  {
    group: "웹뷰 → 확장 프로그램", kind: "설정", name: "setToolEnabled", summary: "이 보드에서 쓸 도구를 켜고 끈다.", request: "{ \"type\": \"setToolEnabled\", \"tool\": \"cursor\", \"enabled\": false }",
    requestFields: [{ name: "tool", type: "claude | codex | cursor", required: "필수", description: "도구" }, { name: "enabled", type: "Boolean", required: "필수", description: "꺼진 도구는 실행·자동 연결·판단에 쓰지 않는다" }], response: STATE,
  },
  {
    group: "웹뷰 → 확장 프로그램", kind: "설정", name: "updateBoardSettings", summary: "팀 공유 설정을 바꾼다.", request: "{ \"type\": \"updateBoardSettings\", \"patch\": { \"maxReviewIterations\": 3 } }",
    requestFields: [
      { name: "patch.maxReviewIterations", type: "1~10", required: "선택", description: "자동 수정·재리뷰 최대 횟수" },
      { name: "patch.stopTimeoutSec", type: "2~120", required: "선택", description: "중단 요청 후 기다리는 시간" },
      { name: "patch.defaultAutoReview", type: "Boolean", required: "선택", description: "새 카드의 자동 수정·재리뷰 기본값" },
    ],
    response: STATE + "\n// 범위를 벗어나면 settingError",
  },
  {
    group: "웹뷰 → 확장 프로그램", kind: "설정", name: "setMachineSetting", summary: "이 기기 설정을 바꾼다.", request: "{ \"type\": \"setMachineSetting\", \"key\": \"matcherTool\", \"value\": \"codex\" }",
    requestFields: [{ name: "key", type: "toolPaths | autoCreateCards | matcherTool", required: "필수", description: "VS Code 사용자 설정에 저장한다" }, { name: "value", type: "설정별", required: "필수", description: "설정 항목 참고" }], response: STATE,
  },

  // ---- 문서 ----
  {
    group: "웹뷰 → 확장 프로그램", kind: "문서", name: "loadCanvas", summary: "카드·공용 문서의 문서 화면을 받고, 파일이 바뀔 때마다 다시 받는다.", request: "{ \"type\": \"loadCanvas\", \"dir\": \"TASK-1\" }", requestFields: [DIR],
    response: "{\n  \"type\": \"canvas\",\n  \"payload\": {\n    \"dir\": \"TASK-1\", \"kind\": \"card\", \"exists\": true, \"trusted\": true,\n    \"docs\": { \"intent\": \"…\", \"spec\": \"…\", \"plan\": \"…\" },\n    \"mode\": \"figures\", \"source\": \"…\", \"code\": \"…\", \"codePath\": \".agent-board/tasks/TASK-1/canvas.tsx\",\n    \"literals\": [{ \"start\": 120, \"end\": 124, \"line\": 6, \"value\": \"BE\", \"kind\": \"string\" }],\n    \"figureLines\": { \"Flow\": 3 },\n    \"state\": {}, \"canStart\": true\n  }\n}",
    responseFields: [
      { name: "docs · markdown", type: "String", required: "선택", description: "글 문서: 카드의 작업 문서 또는 Markdown 공용 문서" },
      { name: "mode", type: "page | figures", required: "선택", description: "default export가 있으면 페이지 문서, 없으면 md에 넣는 그림 모음" },
      { name: "code · error", type: "String", required: "선택", description: "변환한 코드 또는 변환 오류. 신뢰하지 않는 작업 공간이면 둘 다 없다" },
      { name: "literals", type: "CanvasLiteral[]", required: "선택", description: "코드에 직접 쓴 글자와 위치. 화면에서 바로 고칠 때 쓴다" },
    ],
  },
  { group: "웹뷰 → 확장 프로그램", kind: "문서", name: "unwatchCanvas", summary: "문서 감시를 그만둔다.", request: "{ \"type\": \"unwatchCanvas\", \"dir\": \"TASK-1\" }", requestFields: [DIR], response: NONE },
  {
    group: "웹뷰 → 확장 프로그램", kind: "문서", name: "editDocText", summary: "문서 화면에서 바로 고친 절·체크박스·글자를 원문에 넣는다.",
    request: "{\n  \"type\": \"editDocText\",\n  \"dir\": \"TASK-1\",\n  \"target\": \"spec\",\n  \"base\": \"<편집을 시작할 때의 파일 내용>\",\n  \"start\": 120, \"end\": 180,\n  \"text\": \"## 배경\\n\\n새 내용\\n\",\n  \"literal\": false\n}",
    requestFields: [
      DIR,
      { name: "target", type: "code | markdown | intent | spec | plan", required: "필수", description: "code는 그림·canvas 파일, markdown은 Markdown 공용 문서" },
      { name: "base", type: "String", required: "필수", description: "파일이 이와 다르면 고치지 않는다" },
      { name: "start · end", type: "Number", required: "필수", description: "바꿀 원문 구간 [start, end)" },
      { name: "text", type: "String", required: "필수", description: "새 내용" },
      { name: "literal", type: "Boolean", required: "선택", description: "true면 구간은 코드의 문자열이고 text는 새 글자다. 따옴표·이스케이프는 확장 프로그램이 붙인다" },
    ],
    response: "{ \"type\": \"canvas\", … } // 새 내용으로 다시 그린다\n// 충돌: { \"type\": \"docTextConflict\", \"dir\": \"TASK-1\" }",
  },
  {
    group: "웹뷰 → 확장 프로그램", kind: "문서", name: "openCanvasFile", summary: "그림·canvas 코드를 보드 옆 칸에 연다.", request: "{ \"type\": \"openCanvasFile\", \"dir\": \"TASK-1\", \"line\": 20 }",
    requestFields: [DIR, { name: "line", type: "Number", required: "선택", description: "이 줄로 이동한다" }], response: "에디터가 옆 칸에 열린다. 카드에 그림 파일이 없으면 예시 그림 파일을 만든다",
  },
  { group: "웹뷰 → 확장 프로그램", kind: "문서", name: "createCanvas", summary: "카드에 예시 그림 파일을 만든다.", request: "{ \"type\": \"createCanvas\", \"dir\": \"TASK-1\" }", requestFields: [DIR], response: "canvas.tsx를 만들고 옆 칸에 연다 → { \"type\": \"canvas\", … }" },
  { group: "웹뷰 → 확장 프로그램", kind: "문서", name: "requestCanvas", summary: "구현자 에이전트에게 그림을 요청한다.", request: "{ \"type\": \"requestCanvas\", \"dir\": \"TASK-1\" }", requestFields: [DIR], response: "구현자 회차가 시작된다. 에이전트는 canvas.tsx에 그림을 쓰고 md에 ```canvas 이름``` 블록을 넣는다" },
  {
    group: "웹뷰 → 확장 프로그램", kind: "문서", name: "fixCanvas", summary: "그리지 못한 canvas를 고치도록 요청한다.", request: "{ \"type\": \"fixCanvas\", \"dir\": \"TASK-1\", \"error\": \"string\" }",
    requestFields: [DIR, { name: "error", type: "String", required: "필수", description: "변환·실행 오류" }], response: "구현자 회차가 시작된다",
  },
  {
    group: "웹뷰 → 확장 프로그램", kind: "문서", name: "canvasState", summary: "useCanvasState 값을 이 기기에 저장한다.", request: "{ \"type\": \"canvasState\", \"dir\": \"TASK-1\", \"key\": \"tab\", \"value\": \"spec\" }",
    requestFields: [DIR, { name: "key · value", type: "String · JSON", required: "필수", description: "local/canvas-state/에 저장" }], response: NONE,
  },
  { group: "웹뷰 → 확장 프로그램", kind: "문서", name: "canvasError", summary: "문서가 실행 중에 오류를 냈다.", request: "{ \"type\": \"canvasError\", \"dir\": \"TASK-1\", \"message\": \"string\" }", requestFields: [DIR], response: "카드면 구현자 세션에 같은 오류를 한 번만 알린다" },
  { group: "웹뷰 → 확장 프로그램", kind: "문서", name: "openExternal", summary: "문서 안 링크를 브라우저로 연다.", request: "{ \"type\": \"openExternal\", \"href\": \"https://…\" }", requestFields: [{ name: "href", type: "String", required: "필수", description: "http·https만 연다" }], response: NONE },
  {
    group: "웹뷰 → 확장 프로그램", kind: "문서", name: "canvasAction", summary: "canvas의 useCanvasAction 동작을 전한다.", request: "{ \"type\": \"canvasAction\", \"dir\": \"TASK-1\", \"action\": { \"type\": \"openFile\", \"path\": \"src/a.ts\" } }",
    requestFields: [DIR, { name: "action", type: "CanvasActionMessage", required: "필수", description: "아래 canvas 동작 참고" }], response: "동작별 (canvas 동작 참고)",
  },

  // ---- canvas 동작 ----
  {
    group: "canvas 동작", kind: "useCanvasAction", name: "openFile", summary: "레포 안 파일을 연다.", request: "dispatch({ type: \"openFile\", path: \"src/a.ts\", selection: { startLineNumber: 10 } })",
    requestFields: [{ name: "path", type: "String", required: "필수", description: "레포 기준 경로. 레포 밖이면 거부" }, { name: "selection", type: "{ startLineNumber, startColumn, endLineNumber, endColumn }", required: "선택", description: "선택할 범위" }],
    response: "에디터가 열린다",
  },
  { group: "canvas 동작", kind: "useCanvasAction", name: "openAgent", summary: "세션의 출력 원문을 연다.", request: "dispatch({ type: \"openAgent\", agentId: \"<세션 ID>\" })", response: "원문이 있으면 에디터로 연다. 없으면 안내" },
  {
    group: "canvas 동작", kind: "useCanvasAction", name: "newComposerChat", summary: "카드 구현자 에이전트에게 요청을 보낸다.", request: "dispatch({ type: \"newComposerChat\", userPrompt: \"string\" })",
    requestFields: [{ name: "userPrompt", type: "String", required: "필수", description: "보낼 요청. 공용 문서에서는 쓸 수 없다" }], response: "구현자 회차가 시작된다",
  },
];

const FIELD_HEADERS = ["파라미터", "타입", "필수여부", "설명"];
const fieldRows = (fields: Field[]) => fields.map((f) => [f.name, f.type, f.required, f.description]);

function Syntax({ text }: { text: string }) {
  const t = useHostTheme();
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        borderRadius: 8,
        background: t.fill.tertiary,
        color: t.text.primary,
        fontSize: 12,
        lineHeight: "18px",
        whiteSpace: "pre-wrap",
        overflowX: "auto",
        fontFamily: "var(--vscode-editor-font-family, monospace)",
      }}
    >
      {text}
    </pre>
  );
}

function EntryDoc({ entry }: { entry: Entry }) {
  return (
    <Stack gap={16}>
      <Text>{entry.summary}</Text>
      <Stack gap={8}>
        <H3>Request</H3>
        <Text weight="semibold">Request Syntax</Text>
        <Syntax text={entry.request} />
        {entry.requestFields && entry.requestFields.length > 0 && (
          <Stack gap={6}>
            <Text weight="semibold">Request Elements</Text>
            <Table headers={FIELD_HEADERS} rows={fieldRows(entry.requestFields)} />
          </Stack>
        )}
      </Stack>
      <Stack gap={8}>
        <H3>Response</H3>
        <Text weight="semibold">Response Syntax</Text>
        <Syntax text={entry.response} />
        {entry.responseFields && entry.responseFields.length > 0 && (
          <Stack gap={6}>
            <Text weight="semibold">Response Elements</Text>
            <Table headers={FIELD_HEADERS} rows={fieldRows(entry.responseFields)} />
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}

const FLOW_NODES = [
  { id: "agent", label: "Claude · Codex · Cursor" },
  { id: "hook", label: "hook.js" },
  { id: "inbox", label: "local/inbox" },
  { id: "core", label: "코어 · 실행 관리" },
  { id: "files", label: ".agent-board/" },
  { id: "webview", label: "보드 화면" },
  { id: "outbox", label: "local/outbox" },
];
const FLOW_EDGES = [
  { from: "agent", to: "hook" },
  { from: "hook", to: "inbox" },
  { from: "inbox", to: "core" },
  { from: "core", to: "files" },
  { from: "files", to: "webview" },
  { from: "core", to: "outbox" },
];

function InterfaceFlow() {
  const t = useHostTheme();
  const W = 170;
  const H = 34;
  const layout = computeDAGLayout({ nodes: FLOW_NODES, edges: FLOW_EDGES, direction: "horizontal", nodeWidth: W, nodeHeight: H, rankGap: 36, nodeGap: 20, padding: 8 });
  const label = new Map(FLOW_NODES.map((n) => [n.id, n.label]));
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} width="100%" role="img" aria-label="Agent Board 인터페이스 흐름" style={{ maxWidth: layout.width }}>
      <defs>
        <marker id="api-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={t.stroke.primary} />
        </marker>
      </defs>
      {layout.edges.map((e) => (
        <line key={`${e.from}-${e.to}`} x1={e.sourceX} y1={e.sourceY} x2={e.targetX} y2={e.targetY} stroke={t.stroke.primary} markerEnd="url(#api-arrow)" />
      ))}
      {layout.nodes.map((n) => (
        <g key={n.id}>
          <rect x={n.x} y={n.y} width={W} height={H} rx={6} fill={t.fill.secondary} stroke={t.stroke.secondary} />
          <text x={n.x + W / 2} y={n.y + H / 2 + 4} textAnchor="middle" fontSize={12} fill={t.text.primary}>
            {label.get(n.id)}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function ApiSpec() {
  const [query, setQuery] = useCanvasState("query", "");
  const needle = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const matches = ENTRIES.filter((e) => {
      if (!needle) return true;
      const fields = [...(e.requestFields ?? []), ...(e.responseFields ?? [])].map((f) => f.name).join(" ");
      return [e.name, e.summary, e.kind, e.group, fields].join(" ").toLowerCase().includes(needle);
    });
    return GROUPS.map((name) => ({ name, items: matches.filter((e) => e.group === name) })).filter((g) => g.items.length > 0);
  }, [needle]);

  return (
    <Stack gap={20}>
      <Stack gap={6}>
        <Text size="small" tone="tertiary">
          공용 문서 · 요구사항은 `spec.md`, 문서 작성법은 `docs/canvas-guide.md`, 타입은 `src/shared/protocol.ts`
        </Text>
        <H1>Agent Board API 명세서</H1>
        <Text tone="secondary">
          Agent Board가 밖으로 드러내는 접점을 Request와 Response로 정리한다. 보드는 서버 없이 레포 안의 파일로 동작한다. 에이전트 도구는 Hook으로 이벤트를 보내고 알림을 받으며, 보드 화면은 확장 프로그램과 메시지를 주고받는다.
        </Text>
      </Stack>
      <InterfaceFlow />
      <Callout tone="info" title="경계">
        공유 파일(`board.json`·`card.json`·작업 문서·canvas)에는 절대 경로·세션 ID·PID 같은 기기별 값을 쓰지 않는다. 기기별 값은 Git이 무시하는 `.agent-board/local/`에만 둔다.
      </Callout>
      <TextInput value={query} onChange={setQuery} placeholder="이름, 설명, 파라미터로 찾기" />
      {groups.map((group) => (
        <Stack key={group.name} gap={8}>
          <Row gap={8} align="center">
            <H2>{group.name}</H2>
            <Text size="small" tone="tertiary">
              {`${group.items.length}개`}
            </Text>
          </Row>
          {group.items.map((entry) => (
            <CollapsibleSection
              key={`${entry.group}-${entry.name}`}
              title={entry.name}
              leading={<Pill size="sm">{entry.kind}</Pill>}
              trailing={entry.summary}
            >
              <EntryDoc entry={entry} />
            </CollapsibleSection>
          ))}
          <Divider />
        </Stack>
      ))}
      {groups.length === 0 && <Text tone="secondary">찾는 항목이 없습니다.</Text>}

      <CollapsibleSection title="참고: 저장 파일" leading={<Pill size="sm">파일</Pill>}>
        <Table
          headers={["경로", "Git", "내용"]}
          rows={[
            ["`.agent-board/board.json`", "공유", "공용 문서(`{ id, name, category, path, tags? }`), 구분(`{ tag, name, color }`), 쓸 도구, 리뷰·실행 설정. 스키마 2"],
            ["`.agent-board/tasks/<ID>/card.json`", "공유", "id·title·status·statusVersion·agents·workspace·startDate·dueDate·dependsOn·doneAt·order·relatedDocs·autoReview·manualDone"],
            ["`.agent-board/tasks/<ID>/intent.md` · `spec.md` · `plan.md`", "공유", "작업 문서. plan.md의 `- [ ]` 항목이 진행률, `## [BE] 제목`이 구분"],
            ["`.agent-board/tasks/<ID>/canvas.tsx`", "공유", "그림 모음(named export) 또는 페이지 문서(default export)"],
            ["`docs/<이름>.md` + `docs/<이름>.canvas.tsx`", "공유", "Markdown 공용 문서와 그 그림"],
            ["`.agent-board/deleted/<ID>`", "공유", "지운 작업 ID. 다시 쓰지 않는다"],
            ["`.agent-board/local/runs.json` · `events.jsonl`", "제외", "실행 회차 스냅샷과 공통 이벤트 로그"],
            ["`.agent-board/local/sessions.json` · `unlinked.json`", "제외", "카드 → 역할 → 세션 연결, 연결 대기 세션"],
            ["`.agent-board/local/inbox/` · `outbox/`", "제외", "Hook 이벤트와 세션 알림"],
            ["`.agent-board/local/canvas-state/` · `runs/` · `backup/`", "제외", "canvas 상태, 에이전트 출력·프롬프트, 마이그레이션 전 원본"],
          ]}
        />
      </CollapsibleSection>
      <CollapsibleSection title="참고: 공통 이벤트 (AgentEvent)" leading={<Pill size="sm">타입</Pill>}>
        <Syntax
          text={`interface AgentEvent {
  eventId: string;     // 같은 사건이면 같은 값. 이미 처리한 값은 무시
  type: 'run.started' | 'turn.started' | 'file.changed' | 'response.completed'
      | 'input.required' | 'run.ended' | 'run.stopped' | 'run.failed' | 'process.lost';
  tool: 'claude' | 'codex' | 'cursor';
  toolSessionId?: string;
  cardId?: string;
  runId?: string;      // 카드마다 1부터 — cardId와 함께 쓴다
  source: 'stream' | 'hook' | 'runner';
  seq: number;         // 출처별로 커지는 순번. 처리한 값 이하는 상태를 바꾸지 않는다
  occurredAt: string;
  payload?: { summary, verification, changes, error, transcriptPath, cwd, idle, reason, prompt };
}`}
        />
      </CollapsibleSection>
    </Stack>
  );
}
