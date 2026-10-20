import * as path from 'node:path';

/** 보드가 세션에 전달할 알림 파일. Hook 스크립트와 확장 프로그램이 같은 이름 규칙을 쓴다. */
export function outboxFile(outboxDir: string, tool: string, sessionId: string): string {
  return path.join(outboxDir, `${tool}-${sessionId.replace(/[^\w.-]/g, '_')}.json`);
}
