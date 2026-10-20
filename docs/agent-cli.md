# 에이전트 CLI 연동 조사 결과

2단계 사전 조사 결과와 어댑터에 반영한 내용이다. 확인 근거는 다음과 같다.

- **[V]** 로컬 `--help` 출력과 세션 파일 구조로 확인 (Claude Code 2.1.289, codex-cli 0.155.1)
- **[S]** `npm run test:smoke`로 실제 실행해 확인 (2026-10-20)
- **[D]** 문서 기준
- **[U]** 확인되지 않음

## 지원 기능 표 (E-4)

| 기능 | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| 실행 | `claude -p <prompt> --output-format stream-json --verbose` [S] | `codex exec --json -C <dir> -s <sandbox> <prompt>` [S] | `agent -p --output-format stream-json --workspace <dir> --trust <prompt>` [D] |
| 세션 ID | `--session-id <uuid>`로 미리 지정 [S] | `thread.started.thread_id`에서 읽음 [S] | `system/init.session_id`에서 읽음 [D] |
| 재개 | `--resume <id>` [S] | `codex exec resume <id> --json` [V] | `--resume <id>` [D] |
| 중단 | SIGINT → SIGTERM [U: 종료 이벤트 없음] | SIGINT → SIGTERM [U] | SIGINT → SIGTERM [U] |
| 리뷰어 읽기 전용 | `--disallowed-tools Edit Write …` + 읽기 전용 git 명령 허용 [S] | `-s read-only` [S] | 지원 안 함 (`--mode plan`의 제한 범위가 문서화되지 않음) |
| 구현자 권한 | `--permission-mode acceptEdits` (기본) | `-s workspace-write` (기본) | 기본 권한, `force` 옵션 시 `--force` |
| 세션 목록 | `~/.claude/projects/<cwd 변환>/<id>.jsonl` [V] | `~/.codex/sessions/YYYY/MM/DD/rollout-*-<id>.jsonl`의 `session_meta.cwd` [V] | 지원 안 함 (CLI 저장 위치 미문서화) |
| Hook | `.claude/settings.local.json` [D] | `.codex/hooks.json` (`{"hooks": {...}}`) [D, 소스 확인] | `.cursor/hooks.json` (`{"version": 1, "hooks": {...}}`) [D] |

## 이벤트 변환

| 공통 이벤트 | Claude Code | Codex | Cursor |
| --- | --- | --- | --- |
| `run.started` | `system/init`, Hook `SessionStart` | `thread.started`, Hook `SessionStart` | `system/init`, Hook `sessionStart` |
| `turn.started` | Hook `UserPromptSubmit` | Hook `UserPromptSubmit` | Hook `beforeSubmitPrompt` |
| `file.changed` | `tool_use` (Edit·Write·MultiEdit·NotebookEdit), Hook `PostToolUse` | `item.completed` `file_change`, Hook `PostToolUse` | `tool_call` `completed`, Hook `afterFileEdit` |
| `response.completed` | `result` (성공), Hook `Stop` | `item.completed` `agent_message`, Hook `Stop` | `result`, Hook `stop` (completed) |
| `input.required` | Hook `Notification`·`PermissionRequest` | Hook `PermissionRequest` | — |
| `run.failed` | `result.is_error`, Hook `StopFailure`, 0이 아닌 종료 코드 | `turn.failed`, `error`, 0이 아닌 종료 코드 | `result.is_error`, Hook `stop` (error) |
| `run.stopped` | 중단 요청 후 종료 | Hook `Interrupt`, 중단 요청 후 종료 | Hook `stop` (aborted) |
| `run.ended` | 종료 코드 0, Hook `SessionEnd` | 종료 코드 0, Hook `SessionEnd` | 종료 코드 0, Hook `sessionEnd` |

## 확인한 동작과 결정

- headless Claude는 권한이 필요한 도구를 자동으로 거부하고 계속 진행한다. 결과의 `permission_denials`는 입력 요청이 아니므로, 회차는 "실행 종료"로 두고 거부된 도구는 상세 정보로 표시한다.
- 확장 호스트의 `ELECTRON_RUN_AS_NODE=1`이 에이전트 프로세스에 상속되지 않도록 제거한다.
- 회차 번호는 카드마다 1부터 시작한다. 이벤트는 `cardId`와 `runId`를 함께 써서 회차를 찾는다.
- 에이전트 프로세스에는 `AGENT_BOARD_CARD_ID`·`AGENT_BOARD_RUN_ID` 환경 변수를 넘긴다. Hook 스크립트가 이 값을 기록하므로, 같은 세션을 재개한 회차가 여러 개여도 이벤트가 섞이지 않는다.
- Cursor CLI는 이 기기에 설치돼 있지 않아 실제 실행으로 검증하지 못했다.
