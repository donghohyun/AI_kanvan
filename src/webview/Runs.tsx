import { useEffect, useState } from 'react';
import { ROLES, type Card, type Role } from '../core/types';
import type { BoardState, CardView, RunView } from '../shared/protocol';
import { onMessage, send, useT } from './vscode';

// 입력을 기다리는 회차는 중단할 수도, 재개해서 이어 갈 수도 있다.
const BUSY = new Set(['running', 'stopping']);
const STOPPABLE = new Set(['running', 'stopping', 'input_required']);

/** C-4, E-1: 실행 회차 목록과 상세 (요약 → 변경 사항 → 검증·리뷰 결과 → 세션 원문). */
export function Runs({ view, card, state }: { view: CardView; card: Card; state: BoardState }) {
  const t = useT();
  const [runs, setRuns] = useState<RunView[]>([]);
  const [sessions, setSessions] = useState<Partial<Record<Role, string>>>({});
  const [selected, setSelected] = useState<string>();

  useEffect(() => {
    const off = onMessage((msg) => {
      if (msg.type !== 'runs' || msg.dir !== view.dir) return;
      setRuns(msg.runs);
      setSessions(msg.sessions);
    });
    send({ type: 'loadRuns', dir: view.dir });
    return off;
    // state가 바뀔 때마다(이벤트 반영) 다시 읽는다.
  }, [view.dir, state]);

  const run = runs.find((r) => r.runId === selected) ?? runs[runs.length - 1];

  return (
    <div className="runs">
      {ROLES.map((role) => {
        const agent = card.agents[role];
        const tool = agent && state.tools.find((x) => x.id === agent.tool);
        const status = view.runStatus[role];
        const active = status !== undefined && BUSY.has(status);
        const stoppable = status !== undefined && STOPPABLE.has(status);
        const can = (cap: string) => !!tool?.installed && !!tool.capabilities[cap];
        const why = (cap: string) =>
          !agent
            ? t('msg.assignAgentFirst')
            : !tool?.installed
              ? t('runs.notInstalled', { tool: t(`tool.${agent.tool}`) })
              : !tool.capabilities[cap]
                ? t('runs.unsupported', { tool: t(`tool.${agent.tool}`) })
                : undefined;
        return (
          <div key={role} className="role-row">
            <div className="role-head">
              <strong>{t(`role.${role}`)}</strong>
              <span>{agent ? t(`tool.${agent.tool}`) : t('tool.none')}</span>
              {status && <span className={`badge run-${status}`}>{t(`run.${status}`)}</span>}
            </div>
            <div className="muted small">
              {t('runs.session')}: {sessions[role] ? <code>{sessions[role]}</code> : t('runs.noSession')}
            </div>
            <div className="role-actions">
              <button disabled={!can('run') || active} title={why('run')} onClick={() => send({ type: 'startRun', dir: view.dir, role, resume: false })}>
                {t('runs.start')}
              </button>
              <button
                disabled={!can('resume') || active || !sessions[role]}
                title={why('resume')}
                onClick={() => send({ type: 'startRun', dir: view.dir, role, resume: true })}
              >
                {t('runs.resume')}
              </button>
              <button disabled={!can('stop') || !stoppable} title={why('stop')} onClick={() => send({ type: 'stopRun', dir: view.dir, role })}>
                {t('runs.stop')}
              </button>
              <button disabled={!agent || active} onClick={() => send({ type: 'newSession', dir: view.dir, role })}>
                {t('runs.newSession')}
              </button>
              <button
                disabled={!can('sessions') || active}
                title={why('sessions')}
                onClick={() => send({ type: 'pickSession', dir: view.dir, role })}
              >
                {t('runs.pickSession')}
              </button>
              {role === 'reviewer' && (
                <button disabled={!can('run') || active} title={why('run')} onClick={() => send({ type: 'requestReview', dir: view.dir })}>
                  {t('runs.requestReview')}
                </button>
              )}
            </div>
          </div>
        );
      })}

      {runs.length === 0 ? (
        <p className="muted">{t('runs.empty')}</p>
      ) : (
        <>
          <ol className="run-list">
            {runs.map((r) => (
              <li key={r.runId}>
                <button className={r === run ? 'active' : ''} onClick={() => setSelected(r.runId)}>
                  #{r.runId} {t(`role.${r.role}`)} · {t(`tool.${r.tool}`)} · <span className={`run-${r.status}`}>{t(`run.${r.status}`)}</span>
                  <span className="muted small"> {new Date(r.startedAt).toLocaleString()}</span>
                </button>
              </li>
            ))}
          </ol>
          {run && <RunDetail dir={view.dir} run={run} />}
        </>
      )}
    </div>
  );
}

function RunDetail({ dir, run }: { dir: string; run: RunView }) {
  const t = useT();
  const none = <span className="muted">{t('runs.notProvided')}</span>;
  return (
    <div className="run-detail">
      {run.inputChanged && <div className="badge warn">{t('runs.inputChanged')}</div>}
      {run.statusDetail && run.status !== 'unknown' && <div className="muted small">{run.statusDetail}</div>}
      {run.status === 'unknown' && (
        <div className="conflict">
          {run.statusDetail && <span>{run.statusDetail}</span>}
          <button onClick={() => send({ type: 'resolveRun', dir, runId: run.runId, status: 'ended' })}>{t('runs.markEnded')}</button>
          <button onClick={() => send({ type: 'resolveRun', dir, runId: run.runId, status: 'error' })}>{t('runs.markError')}</button>
        </div>
      )}
      <h4>{t('runs.summary')}</h4>
      {run.summary ? <pre className="text">{run.summary}</pre> : none}
      <h4>{t('runs.changes')}</h4>
      {run.changes?.length ? (
        <ul>
          {run.changes.map((f) => (
            <li key={f}>
              <code>{f}</code>
            </li>
          ))}
        </ul>
      ) : (
        none
      )}
      {run.diff && (
        <details>
          <summary>diff</summary>
          <pre className="diff">{run.diff}</pre>
        </details>
      )}
      <h4>{t('runs.verification')}</h4>
      {run.reviewedRef && <div className="muted small">{t('runs.reviewedRef', { ref: run.reviewedRef })}</div>}
      {run.review && (
        <div>
          <span className={`badge ${run.review.verdict === 'pass' ? 'ok' : 'warn'}`}>
            {t(run.review.verdict === 'pass' ? 'runs.reviewPass' : 'runs.reviewChanges')}
          </span>
          <ul>
            {run.review.findings.map((f, i) => (
              <li key={i}>
                {f.file && (
                  <code>
                    {f.file}
                    {f.line !== undefined && `:${f.line}`}
                  </code>
                )}{' '}
                {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {run.verification ? <pre className="text">{run.verification}</pre> : !run.review && none}
      <h4>{t('runs.transcript')}</h4>
      {run.transcriptPath ? (
        <button onClick={() => send({ type: 'openTranscript', dir, runId: run.runId })}>{t('runs.openTranscript')}</button>
      ) : (
        none
      )}
    </div>
  );
}
