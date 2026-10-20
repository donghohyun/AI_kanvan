import { useEffect, useRef, useState } from 'react';
import { parseChecklist } from '../core/checklist';
import { unknownTags } from '../core/board';
import type { Category, TaskDoc } from '../core/types';
import { onMessage, send, useT } from './vscode';

type Conflict = { fileContent: string | undefined };

/** M-1, M-3: 작업 문서 편집기. 편집 중 파일이 바뀌면 덮어쓰지 않고 충돌을 표시한다. */
export function DocEditor({ dir, doc, categories = [] }: { dir: string; doc: TaskDoc; categories?: Category[] }) {
  const t = useT();
  const [loaded, setLoaded] = useState(false);
  const [base, setBase] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [conflict, setConflict] = useState<Conflict>();
  const dirty = draft !== (base ?? '');

  // 메시지 핸들러에서 최신 값을 읽기 위한 ref
  const latest = useRef({ loaded, base, dirty });
  latest.current = { loaded, base, dirty };

  useEffect(() => {
    const off = onMessage((msg) => {
      if (msg.type !== 'doc' && msg.type !== 'docSaved' && msg.type !== 'docConflict') return;
      if (msg.dir !== dir || msg.doc !== doc) return;
      if (msg.type === 'doc') {
        const { loaded: wasLoaded, base: currentBase, dirty: isDirty } = latest.current;
        setLoaded(true);
        if (!wasLoaded || !isDirty) {
          setBase(msg.content);
          setDraft(msg.content ?? '');
          setConflict(undefined);
        } else if (msg.content !== currentBase) {
          setConflict({ fileContent: msg.content });
        }
      } else if (msg.type === 'docSaved') {
        setBase(msg.content);
        setDraft(msg.content);
        setConflict(undefined);
      } else {
        setConflict({ fileContent: msg.fileContent });
      }
    });
    send({ type: 'watchDoc', dir, doc });
    return () => {
      off();
      send({ type: 'unwatchDoc', dir, doc });
    };
  }, [dir, doc]);

  const save = (baseOverride?: Conflict) =>
    send({ type: 'saveDoc', dir, doc, content: draft, base: baseOverride ? baseOverride.fileContent : base });

  const items = doc === 'plan' ? parseChecklist(base ?? '') : [];
  // TASK-2 CT-3: 보드에 없는 구분 태그는 미분류로 집계된다고 알린다.
  const unknown = unknownTags(items, categories);

  return (
    <div className="doc-editor">
      <div className="doc-toolbar">
        <button onClick={() => send({ type: 'openTaskDoc', dir, doc })}>{t('detail.openInEditor')}</button>
        <span className="spacer" />
        {dirty && <span className="muted">{t('editor.unsaved')}</span>}
        <button disabled={!dirty} onClick={() => setDraft(base ?? '')}>
          {t('editor.revert')}
        </button>
        <button className="primary" disabled={!dirty || !!conflict} onClick={() => save()}>
          {t('editor.save')}
        </button>
      </div>
      {loaded && base === undefined && <div className="muted">{t('editor.missing')}</div>}
      {conflict && (
        <div className="conflict" role="alert">
          <span>{t('editor.conflict')}</span>
          <button onClick={() => save(conflict)}>{t('editor.keepMine')}</button>
          <button
            onClick={() => {
              setBase(conflict.fileContent);
              setDraft(conflict.fileContent ?? '');
              setConflict(undefined);
            }}
          >
            {t('editor.useFile')}
          </button>
          <button onClick={() => send({ type: 'compareDoc', dir, doc, content: draft })}>{t('editor.compare')}</button>
        </div>
      )}
      {unknown.length > 0 && <div className="badge warn">{t('editor.unknownTags', { tags: unknown.map((x) => `[${x}]`).join(', ') })}</div>}
      {items.length > 0 && (
        <ul className="checklist">
          {items.map((item) => (
            <li key={item.line} style={{ paddingLeft: item.depth * 8 }}>
              <label>
                <input
                  type="checkbox"
                  checked={item.checked}
                  disabled={dirty}
                  onChange={(e) =>
                    send({ type: 'toggleChecklist', dir, line: item.line, text: item.text, checked: e.target.checked })
                  }
                />
                {item.text}
              </label>
            </li>
          ))}
        </ul>
      )}
      <textarea
        className="doc-text"
        spellCheck={false}
        value={draft}
        aria-label={`${doc}.md`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            if (dirty && !conflict) save();
          }
        }}
      />
    </div>
  );
}
