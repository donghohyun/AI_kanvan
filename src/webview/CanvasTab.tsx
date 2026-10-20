import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BoardState, CanvasActionMessage, CanvasPayload, CardView, ToExtension } from '../shared/protocol';
import { MarkdownDocument } from './canvas/markdown';
import { CanvasFrame, CanvasView } from './canvas/runtime';
import { DefaultCardDocument } from './DefaultCardDocument';
import { onMessage, send, useT } from './vscode';

/**
 * TASK-3 문서 탭. 모든 카드·공용 문서를 canvas 스타일로 보여 준다.
 * - canvas.tsx가 있으면 실행해서 그린다.
 * - canvas.tsx가 없는 카드는 intent·spec·plan으로 만든 기본 문서를 그린다.
 * - Markdown 공용 문서는 canvas 컴포넌트로 그린다.
 * `dir`은 카드 ID 또는 `shared:<문서 ID>`다.
 */
export function CanvasTab({ dir, view, state }: { dir: string; view?: CardView; state: BoardState }) {
  const t = useT();
  const [payload, setPayload] = useState<CanvasPayload>();
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    const off = onMessage((msg) => {
      if (msg.type === 'canvas' && msg.payload.dir === dir) setPayload(msg.payload);
    });
    send({ type: 'loadCanvas', dir });
    return () => {
      off();
      send({ type: 'unwatchCanvas', dir });
    };
  }, [dir]);

  const host = useMemo(
    () => ({
      setState: (key: string, value: unknown) => send({ type: 'canvasState', dir, key, value }),
      dispatch: (action: CanvasActionMessage) => send({ type: 'canvasAction', dir, action }),
      openLink: (href: string) => send({ type: 'openExternal', href }),
    }),
    [dir],
  );
  const onError = useCallback((message: string) => send({ type: 'canvasError', dir, message }), [dir]);

  const ask = (msg: ToExtension) => {
    send(msg);
    setRequested(true);
  };
  const canAsk = payload?.kind === 'card' && payload.canStart;

  const failure = (message: string) => (
    <div className="canvas-empty" role="alert">
      <strong>{t('canvas.error')}</strong>
      <pre className="text">{message}</pre>
      <div className="role-actions">
        {payload?.kind === 'card' && (
          <button className="primary" disabled={!canAsk} title={canAsk ? undefined : t('canvas.noAgent')} onClick={() => ask({ type: 'fixCanvas', dir, error: message })}>
            {t('canvas.fix')}
          </button>
        )}
        <button onClick={() => send({ type: 'openCanvasFile', dir })}>{t('canvas.open')}</button>
      </div>
      {requested && <span className="muted small">{t('canvas.requested')}</span>}
    </div>
  );

  if (!payload) return <p className="muted canvas-empty">{t('canvas.loading')}</p>;
  if (payload.unsupported) {
    return (
      <div className="canvas-empty">
        <span>{t('canvas.unsupported')}</span>
        <button onClick={() => send({ type: 'openCanvasFile', dir })}>{t('detail.openInEditor')}</button>
      </div>
    );
  }
  // 코드를 실행하지 않는 문서는 신뢰하지 않는 작업 공간에서도 보여 준다.
  if (payload.markdown !== undefined) {
    return (
      <CanvasFrame state={payload.state} host={host}>
        <MarkdownDocument source={payload.markdown} />
      </CanvasFrame>
    );
  }
  if (!payload.exists && payload.kind === 'card' && view) {
    return (
      <>
        <div className="canvas-toolbar">
          <span className="muted small">{t('canvas.defaultHint')}</span>
          <span className="spacer" />
          {requested && <span className="muted small">{t('canvas.requested')}</span>}
          <button disabled={!canAsk} title={canAsk ? undefined : t('canvas.noAgent')} onClick={() => ask({ type: 'requestCanvas', dir })}>
            {t('canvas.request')}
          </button>
          <button onClick={() => send({ type: 'createCanvas', dir })}>{t('canvas.create')}</button>
        </div>
        <CanvasFrame state={payload.state} host={host}>
          <DefaultCardDocument view={view} state={state} docs={payload.docs ?? {}} />
        </CanvasFrame>
      </>
    );
  }
  if (!payload.exists) return <div className="canvas-empty">{t('shared.broken')}</div>;
  if (!payload.trusted) return <div className="canvas-empty">{t('canvas.untrusted')}</div>;
  if (payload.error || !payload.code) return failure(payload.error ?? t('canvas.error'));
  return <CanvasView code={payload.code} state={payload.state} host={host} onError={onError} fallback={failure} />;
}
