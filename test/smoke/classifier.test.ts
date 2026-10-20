// 실제 CLI로 카드 판단을 해 본다 (모델 사용량 발생). AGENT_BOARD_SMOKE=classify npm run test:smoke

import { describe, expect, it } from 'vitest';
import { ADAPTERS } from '../../src/adapters';
import { classifierPrompt, parseClassifierOutput, type CardSummary } from '../../src/runner/cardMatcher';
import { runClassifier } from '../../src/runner/classifier';
import { findBinary } from '../../src/runner/tools';
import type { ToolId } from '../../src/core/types';

const enabled = (process.env.AGENT_BOARD_SMOKE ?? '').split(',').includes('classify');
const cards: CardSummary[] = [
  { id: 'TASK-1', title: '로그인 구현', status: 'in_progress', intent: '이메일과 비밀번호로 로그인한다', plan: '- [x] 로그인 화면\n- [ ] 세션 유지' },
  { id: 'TASK-2', title: '결제 연동', status: 'todo', intent: '토스 결제 API를 연동한다' },
];

describe.skipIf(!enabled)('real classifier', () => {
  for (const tool of ['claude', 'codex'] as ToolId[]) {
    it(`${tool}: continues an existing card or creates a new one`, async () => {
      const bin = await findBinary(ADAPTERS[tool]);
      expect(bin).toBeDefined();
      const existing = parseClassifierOutput(await runClassifier(tool, bin!, classifierPrompt('로그인 화면에 구글 소셜 로그인 버튼도 추가해줘', cards)), '', cards);
      const fresh = parseClassifierOutput(await runClassifier(tool, bin!, classifierPrompt('README에 설치 방법을 정리해줘', cards)), '', cards);
      console.log(tool, JSON.stringify(existing), JSON.stringify(fresh));
      expect(existing?.cardId).toBe('TASK-1');
      expect(existing?.via).toBe('classifier');
      expect(fresh?.cardId).toBeUndefined();
      expect(fresh?.plan.length).toBeGreaterThan(0);
    }, 240_000);
  }
});
