import type { BoardState } from '../shared/protocol';
import { send, useT } from './vscode';

/** E-8: worktree로 카드를 판별하지 못한 세션. */
export function UnlinkedSessions({ state }: { state: BoardState }) {
  const t = useT();
  if (state.unlinkedSessions.length === 0) return null;
  return (
    <div className="warnings">
      <strong>{t('sessions.unlinked')}</strong>
      {state.unlinkedSessions.map((s) => (
        <div key={`${s.tool}:${s.sessionId}`} className="warning-row">
          {t(`tool.${s.tool}`)} <code>{s.sessionId.slice(0, 8)}</code> <span className="muted">{s.cwd}</span>
          <button onClick={() => send({ type: 'linkSession', tool: s.tool, sessionId: s.sessionId })}>{t('sessions.link')}</button>
        </div>
      ))}
    </div>
  );
}
