import { useEffect } from 'react';
import type { BoardState } from '../shared/protocol';
import { CanvasTab } from './CanvasTab';
import { send, useT } from './vscode';

/** 공용 문서를 보드 안에서 전체 화면 문서로 연다 (canvas·Markdown). */
export function SharedDocPage({ docId, state, onBack }: { docId: string; state: BoardState; onBack: () => void }) {
  const t = useT();
  const doc = state.board?.sharedDocs.find((d) => d.id === docId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (e.key === 'Escape' && !typing) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  if (!doc) return null;
  return (
    <div className="card-page" aria-label={doc.name}>
      <header className="card-page-bar">
        <button className="link-button" onClick={onBack}>
          ← {t('page.back')}
        </button>
        <span className="muted">{t(`category.${doc.category}`)}</span>
        <code>{doc.path}</code>
        <span className="spacer" />
        <button onClick={() => send({ type: 'openSharedDoc', id: doc.id })}>{t('detail.openInEditor')}</button>
      </header>
      <div className="card-page-body canvas-tab">
        <CanvasTab key={doc.id} dir={`shared:${doc.id}`} state={state} />
      </div>
    </div>
  );
}

/** 보드 안에서 문서로 여는 공용 문서 형식 */
export function opensInBoard(path: string): boolean {
  return path.endsWith('.canvas.tsx') || /\.(md|markdown)$/i.test(path);
}
