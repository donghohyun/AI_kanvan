# TASK-3 카드 문서 화면 (Canvas 호환) — Intent

## 목적

카드를 누르면 그 작업을 한눈에 이해할 수 있는 문서가 전체 화면으로 열리게 한다. 문서는 Cursor canvas와 같은 형식(`.canvas.tsx`)으로 쓰고, 보드가 직접 렌더링한다. 그러면 Cursor·Claude Code·Codex 어느 에이전트든 같은 문서를 만들고 고칠 수 있다.

## 배경

- 참고 시안(인프라 기반 작업)은 Cursor canvas로 만든 문서다. 위쪽에 뒤로·수정일·브랜치·마감, 태그와 제목·요약, 강조 지표, 경계 안내, 의존 관계 표, 브랜치·배포 흐름 다이어그램이 있다.
- Cursor canvas는 `cursor/canvas` 모듈의 React 컴포넌트로 쓴 `.canvas.tsx` 파일이다. 오픈소스가 아니고 형식 문서나 외부 확장용 API도 없다. 다만 Cursor가 설치한 타입 선언으로 컴포넌트 이름과 사용법을 알 수 있다.
- 같은 이름·사용법의 컴포넌트를 직접 구현하면 canvas 파일을 보드에서 그대로 보여 줄 수 있다. Cursor 내부 코드는 쓰지 않는다.
- 2026-10-20 시험: Claude Code와 Codex에 canvas 사용법과 타입 선언을 주고 TASK-2 문서를 canvas로 만들게 했다. 두 결과물 모두 SDK 타입 오류 0개였고 디자인 규칙을 지켰다. Cursor와의 차이는 사용법 자동 제공, 편집 후 자동 검사, 실시간 미리보기 같은 주변 도구다.

## 범위

### 포함

- 카드 문서 화면: 카드를 누르면 보드 대신 전체 화면으로 열리고, 맨 위에 뒤로·수정일·브랜치·마감이 있다. 기존 편집 탭(개요·Intent·Spec·Plan·실행 이력)은 이 화면의 탭으로 옮긴다.
- 카드 폴더의 `canvas.tsx`를 컴파일해 `cursor/canvas` 호환 컴포넌트로 렌더링한다.
- 호환 컴포넌트: 레이아웃, 글자, 카드, 표, 지표, 안내 상자, 할 일 목록, 폼, 사용량 막대, 차트, diff, DAG 배치 계산, 테마·상태·동작 훅
- 에이전트 지원: canvas 작성 안내서, "문서 만들기" 실행, 렌더링 오류를 화면과 연결된 세션에 전달
- 안전장치: 신뢰하지 않는 작업 공간에서는 canvas를 실행하지 않는다.

### 제외

- 기존 `@task` 헤더 canvas 가져오기
- Cursor 관리 폴더(`~/.cursor/projects/.../canvases`)와의 동기화
- canvas 타입 검사(TypeScript 컴파일러를 확장 프로그램에 넣지 않는다)

### 결정 사항

| 항목 | 결정 |
| --- | --- |
| 문서 형식 | Cursor canvas 호환 `canvas.tsx` |
| 화면 배치 | 전체 화면 + 뒤로 |
| 기존 canvas 가져오기 | 하지 않음 |

## Added request (2026-10-20)

TASK-3 카드 문서를 canvas 형식(.canvas.tsx)으로 작성하여 팀에 태스크의 목적, 현재 상태, 핵심 결정사항, 요구사항 그룹별 진행, 흐름도를 보여준다.

Recorded automatically from Claude Code session `5391e427-ced3-42e7-b3ec-8a5be452357f` on 2026-10-20.

> You are writing the document (canvas) for this task, managed by Agent Board.
> 
> Task TASK-3: 카드 문서 화면 (Canvas 호환)
> 
> 카드를 누르면 전체 화면 문서가 열리고, 카드의 canvas.tsx를 cursor/canvas 호환 컴포넌트로 렌더링한다.
> 
> Task documents (read them first):
> - intent: /Users/echo/project/AI_kanvan/AI_kanvan/.agent-board/tasks/TASK-3/intent.md
> - spec: /Users/echo/project/AI_kanvan/AI_kanvan/.agent-board/tasks/TASK-3/spec.md
> - plan: /Users/echo/project/AI_kanvan/AI_kanvan/.agent-board/tasks/TASK-3/plan.md
> 
> First read the canvas guide: /Users/echo/project/AI_kanvan/AI_kanvan/docs/canvas-guide.md
> Then write exactly one file: /Users/echo/project/AI_kanvan/AI_kanvan/.agent-board/tasks/TASK-3/canvas.tsx
> The canvas presents this task to the team: what it is for and its current state, the key decisions or boundaries, the requirement groups, progress by category, and a diagram when a flow or dependency is easier to see as boxes and arrows.
> Follow the guide's file rules and design rules. Do not modify any other file. Reply with one sentence when done.
