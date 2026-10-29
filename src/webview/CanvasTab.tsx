import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BoardState, CanvasActionMessage, CanvasPayload, CardView, ToExtension } from '../shared/protocol';
import { FiguresContext, type FigureSet } from './canvas/markdown';
import { CanvasFrame, CanvasView, loadFigures } from './canvas/runtime';
import { DefaultCardDocument } from './DefaultCardDocument';
import { CodeEditLayer, ConflictBanner, EditableMarkdown } from './DocEditing';
import { onMessage, send, useT } from './vscode';

/**
 * TASK-3 문서 탭. 모든 카드·공용 문서를 canvas 스타일로 보여 준다.
 * - 글 문서: 카드는 intent·spec·plan, 공용 문서는 Markdown 파일을 그린다. ```canvas 이름``` 블록 자리에 그림 파일의 컴포넌트를 넣는다.
 *   그림 파일은 카드의 canvas.tsx, Markdown 공용 문서 옆의 `.canvas.tsx`다.
 * - 페이지 문서: canvas.tsx·`.canvas.tsx`에 default export가 있으면 그 컴포넌트가 문서 전체다 (API 명세 같은 참조 문서).
 * 글은 눌러서 바로 고치고, 그림·페이지 안의 글자는 두 번 눌러 고친다.
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

  // 그림 컴포넌트는 코드가 바뀔 때만 다시 불러온다. 다시 불러오면 그림이 처음부터 다시 그려진다.
  const loaded = useMemo((): { components: FigureSet['components']; error?: string } => {
    if (!payload?.code || payload.mode !== 'figures') return { components: {} };
    try {
      return { components: loadFigures(payload.code) };
    } catch (err) {
      return { components: {}, error: (err as Error).message };
    }
  }, [payload?.code, payload?.mode]);
  const figureProblem =
    payload?.mode !== 'figures'
      ? t('canvas.noFigures')
      : !payload.trusted
        ? t('canvas.figuresUntrusted')
        : payload.error || loaded.error
          ? t('canvas.figuresError', { error: payload.error ?? loaded.error ?? '' })
          : undefined;
  const figures: FigureSet = {
    components: loaded.components,
    unavailable: figureProblem,
    onError,
    version: payload?.code,
    missing: (name) => t('canvas.figureMissing', { name, path: payload?.codePath ?? '' }),
  };

  const ask = (msg: ToExtension) => {
    send(msg);
    setRequested(true);
  };
  const isCard = payload?.kind === 'card';
  const canAsk = isCard && !!payload?.canStart;

  const failure = (message: string) => (
    <div className="canvas-empty" role="alert">
      <strong>{t('canvas.error')}</strong>
      <pre className="text">{message}</pre>
      <div className="role-actions">
        {isCard && (
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
  if (!isCard && !payload.exists) return <div className="canvas-empty">{t('shared.broken')}</div>;

  const toolbar = (hint?: string) => (
    <div className="canvas-toolbar">
      <span className="muted small canvas-hint">{hint}</span>
      <span className="spacer" />
      {requested && <span className="muted small">{t('canvas.requested')}</span>}
      {isCard && (
        <button disabled={!canAsk} title={canAsk ? undefined : t('canvas.noAgent')} onClick={() => ask({ type: 'requestCanvas', dir })}>
          {t('canvas.request')}
        </button>
      )}
      {(isCard || payload.source !== undefined) && (
        <button onClick={() => send({ type: 'openCanvasFile', dir })}>{payload.source !== undefined ? t('edit.code') : t('canvas.create')}</button>
      )}
    </div>
  );
  const layer = (children: ReactNode) => (
    <CodeEditLayer dir={dir} payload={payload} canAsk={canAsk}>
      {children}
    </CodeEditLayer>
  );

  // 페이지 문서: 코드가 문서 전체다.
  if (payload.mode === 'page') {
    if (!payload.trusted) return <div className="canvas-empty">{t('canvas.untrusted')}</div>;
    if (payload.error || !payload.code) return failure(payload.error ?? t('canvas.error'));
    return (
      <>
        {toolbar(t('edit.hintPage'))}
        <ConflictBanner dir={dir} />
        {layer(
          <div data-code-zone>
            <CanvasView code={payload.code} state={payload.state} host={host} onError={onError} fallback={failure} />
          </div>,
        )}
      </>
    );
  }

  // 글 문서: 코드를 실행하지 않는 부분은 신뢰하지 않는 작업 공간에서도 보여 준다.
  return (
    <>
      {toolbar(t('edit.hint'))}
      <ConflictBanner dir={dir} />
      <CanvasFrame state={payload.state} host={host}>
        <FiguresContext.Provider value={figures}>
          {layer(
            isCard && view ? (
              <DefaultCardDocument view={view} state={state} docs={payload.docs ?? {}} />
            ) : (
              <EditableMarkdown dir={dir} target="markdown" source={payload.markdown ?? ''} />
            ),
          )}
        </FiguresContext.Provider>
      </CanvasFrame>
    </>
  );
}
