# TASK-3 카드 문서 화면 (Canvas 호환) — Spec

ID 접두어는 CP(카드 화면), CV(canvas 렌더링), CA(에이전트 지원)다.

## 요구사항

### 1. 카드 문서 화면

- **CP-1** 카드를 누르거나 Enter를 누르면 보드 대신 카드 화면이 전체 화면으로 열린다. 맨 위 줄에는 뒤로, 작업 ID, 수정일, 브랜치, 마감일 입력이 있다. 뒤로나 Esc를 누르면 보드로 돌아간다.
- **CP-2** 탭은 문서·개요·Intent·Spec·Plan·실행 이력 순서다. canvas가 있으면 문서 탭이, 없으면 개요 탭이 처음 열린다.
- **CP-3** 선행 작업을 누르면 그 카드의 화면으로 바뀐다.

### 2. Canvas 렌더링

- **CV-1** 카드 폴더의 `canvas.tsx`를 확장 프로그램이 JavaScript로 변환해 웹뷰에 보낸다. 파일이 바뀌면 1초 안에 다시 그린다.
- **CV-2** canvas는 `cursor/canvas`와 `react`만 가져올 수 있다. 다른 모듈을 가져오면 오류로 표시한다.
- **CV-3** `cursor/canvas` 호환 모듈은 다음을 제공한다. 컴포넌트 이름과 속성은 Cursor SDK 타입 선언과 같다.
  - 레이아웃·글자: Stack, Row, Grid, Spacer, Divider, H1, H2, H3, Text(백틱 코드·마크다운 링크 처리), Code, Link
  - 표면: Card, CardHeader, CardBody, CollapsibleSection
  - 데이터: Stat, Table, Pill, Callout, Swatch, UsageBar, TodoList, TodoListCard, DiffView, DiffStats
  - 차트: BarChart, LineChart, PieChart (SVG)
  - 폼: TextInput, TextArea, Checkbox, Toggle, Select, IconButton, Button
  - 계산·훅: computeDAGLayout, mergeStyle, useHostTheme, useCanvasState, useCanvasAction, React 훅(useState·useEffect·useMemo·useRef)
  - 토큰: canvasTokens, canvasTokensLight, 팔레트, chartPalette, colorPalette, usageColorSequence
- **CV-4** `useHostTheme()`는 VS Code 테마 색으로 토큰을 만든다. 테마가 바뀌면 다시 그린다.
- **CV-5** `useCanvasState`는 카드별로 이 기기의 `.agent-board/local/canvas-state/<ID>.json`에 저장한다.
- **CV-6** `useCanvasAction`의 동작:
  - `openFile`: 레포 안의 파일만 연다.
  - `openAgent`: 그 세션의 원문을 연다.
  - `newComposerChat`: 카드 구현자에게 요청을 보내 실행한다.
- **CV-7** 링크는 http·https만 외부 브라우저로 연다.
- **CV-8** 변환 오류와 렌더링 오류는 문서 탭에 오류 내용으로 표시하고, 보드의 다른 부분은 계속 동작한다.
- **CV-9** 신뢰하지 않는 작업 공간에서는 canvas를 실행하지 않고 이유를 표시한다.

### 3. 에이전트 지원

- **CA-1** 확장 프로그램은 canvas 작성 안내서(`docs/canvas-guide.md`)를 함께 배포한다. 안내서는 파일 위치, 가져올 수 있는 모듈, 컴포넌트 목록과 속성, 디자인 규칙을 설명한다.
- **CA-2** canvas가 없으면 문서 탭에 "에이전트에게 문서 만들기 요청" 버튼을 둔다. 누르면 구현자 에이전트가 안내서와 작업 문서를 읽고 `canvas.tsx`를 쓰는 회차를 시작한다.
- **CA-3** 변환·렌더링 오류가 나면, 카드 구현자에 연결된 세션에 오류 내용을 Hook 알림으로 전달한다. 같은 오류는 한 번만 보낸다. 문서 탭의 "에이전트에게 고치기 요청" 버튼으로도 고칠 수 있다.
- **CA-4** 세션에 보내는 카드 연결 알림(E-12)에 canvas 경로와 안내서 경로를 포함한다.
- canvas.tsx 파일을 /Users/echo/project/AI_kanvan/AI_kanvan/.agent-board/tasks/TASK-3/canvas.tsx에 작성
- canvas-guide.md의 파일 규칙과 디자인 규칙 준수
- 캔버스는 다음을 포함: 태스크 목적, 현재 상태, 핵심 결정사항/경계, 요구사항 그룹, 범주별([BE], [FE], [Infra], [Design], [DevOps]) 진행률, 흐름/의존성 다이어그램
- 다른 파일은 수정하지 않음

## 완료 조건

- [x] 카드를 누르면 전체 화면 카드 화면이 열리고, 뒤로·Esc로 보드에 돌아온다.
- [x] Claude Code·Codex가 만든 TASK-2 canvas 두 개가 오류 없이 렌더링된다.
- [x] 이 기기의 기존 Cursor canvas들도 렌더링된다(사용 컴포넌트 범위 안에서).
- [x] canvas를 고치면 1초 안에 다시 그려지고, 문법 오류는 문서 탭에 표시된다.
- [x] canvas가 없는 카드에서 "문서 만들기" 요청으로 구현자 회차가 시작된다.
- [x] 신뢰하지 않는 작업 공간에서는 canvas를 실행하지 않는다.
