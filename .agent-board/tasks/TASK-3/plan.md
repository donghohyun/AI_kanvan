# TASK-3 카드 문서 화면 (Canvas 호환) — Plan

## [BE] 변환과 전달

- [x] canvas.tsx를 JavaScript로 변환(sucrase), 오류 위치 포함 (CV-1, CV-8)
- [x] 파일 감시와 다시 그리기, 신뢰하지 않는 작업 공간 처리 (CV-1, CV-9)
- [x] canvas 상태 저장(local/canvas-state), 동작 처리(openFile·openAgent·newComposerChat), 외부 링크 (CV-5, CV-6, CV-7)
- [x] 웹뷰 보안 정책에 unsafe-eval 허용 (CV-1)
- [x] 단위 테스트

## [FE] 호환 컴포넌트

- [x] 레이아웃·글자·표면·데이터 컴포넌트 (CV-3)
- [x] 폼 컴포넌트 (CV-3)
- [x] 차트(Bar·Line·Pie)와 DiffView (CV-3)
- [x] computeDAGLayout (CV-3)
- [x] useHostTheme·useCanvasState·useCanvasAction과 토큰 (CV-3 ~ CV-6)
- [x] 모듈 로더와 오류 경계 (CV-2, CV-8)

## [FE] 카드 화면

- [x] 전체 화면 카드 화면과 상단 줄, 뒤로·Esc (CP-1)
- [x] 탭 구성과 기본 탭, 선행 작업 이동 (CP-2, CP-3)
- [x] 문서 탭: canvas 표시, 없을 때 만들기 요청, 오류 표시와 고치기 요청 (CA-2, CA-3, CV-8)

## [BE] 에이전트 지원

- [x] canvas 작성 안내서 (CA-1)
- [x] 문서 만들기·고치기 프롬프트와 회차 시작 (CA-2, CA-3)
- [x] 오류를 연결된 세션에 Hook 알림으로 전달, 중복 방지 (CA-3)
- [x] 카드 연결 알림에 canvas·안내서 경로 추가 (CA-4)

## [BE] 검증

- [x] Claude·Codex가 만든 TASK-2 canvas 렌더링 확인
- [x] 이 기기의 Cursor canvas 렌더링 확인
- [x] 통합 테스트와 패키징

## Checklist

- [x] canvas-guide.md 읽고 canvas 형식 이해
- [x] TASK-3 intent, spec, plan 문서 읽기
- [x] 태스크 목적과 현재 상태 분석
- [x] Canvas 구조 설계 (목적, 상태, 결정사항, 요구사항별 범주, 진행률)
- [x] canvas.tsx 구현 (guide 규칙 준수)
- [x] Canvas.tsx 유효성 확인

## [FE] 모든 문서를 canvas 스타일로

- [x] canvas.tsx가 없는 카드의 기본 문서(메타·지표·선행·의도·요구사항·계획)
- [x] Markdown을 canvas 컴포넌트로 그리기(제목·목록·체크리스트·표·코드·인용, 빈 템플릿 절 생략)
- [x] 공용 문서를 보드 안 문서 화면으로 열기(.canvas.tsx·.md)
- [x] API 명세서를 canvas(docs/api.canvas.tsx)로 작성, Cursor SDK 타입 검사 0개
