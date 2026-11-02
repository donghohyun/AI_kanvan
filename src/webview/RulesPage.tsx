import { useEffect, useState } from 'react';
import { TOOL_IDS, type SharedDoc, type ToolId } from '../core/types';
import type { BoardState, RuleFileView } from '../shared/protocol';
import { send, useT } from './vscode';

type RuleDoc = SharedDoc & { rule: NonNullable<SharedDoc['rule']> };

/** AI 규칙: 규칙 문서 하나를 Claude·Codex·Cursor가 읽는 파일로 넘긴다. */
export function RulesPage({ state, onBack, onOpenDoc }: { state: BoardState; onBack: () => void; onOpenDoc: (id: string) => void }) {
  const t = useT();
  const rules = (state.board?.sharedDocs ?? []).filter((d): d is RuleDoc => !!d.rule);
  const [selected, setSelected] = useState<string | undefined>(rules[0]?.id);
  const current = rules.find((r) => r.id === selected) ?? rules[0];
  const { files, importable, duplicates } = state.rules;
  const fileState = (id: string) => {
    const mine = files.filter((f) => f.ruleIds.includes(id));
    return mine.some((f) => f.state !== 'ok') ? 'warn' : mine.length ? 'ok' : 'none';
  };
  const scopes = [...new Set(rules.map((r) => r.rule.scope))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  const name = (id: string) => rules.find((r) => r.id === id)?.name ?? id;
  const problems = files.filter((f) => f.state !== 'ok');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
      if (e.key === 'Escape' && !typing) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className="card-page rules-page" aria-label={t('rules.title')}>
      <header className="card-page-bar">
        <button className="link-button" onClick={onBack}>
          ← {t('page.back')}
        </button>
        <strong>{t('rules.title')}</strong>
        <span className="muted">{t('rules.summary', { rules: rules.length, files: files.length })}</span>
        <span className="spacer" />
        {importable.length > 0 && (
          <button onClick={() => send({ type: 'importRules' })}>{t('rules.importN', { n: importable.length })}</button>
        )}
        <button className="primary" onClick={() => send({ type: 'addRule' })}>
          + {t('rules.add')}
        </button>
      </header>
      <div className="rules-layout">
        <aside className="rules-side">
          {importable.length > 0 && (
            <div className="rules-alert">
              {t('rules.importHint', { files: importable.join(', ') })}{' '}
              <button className="link" onClick={() => send({ type: 'importRules' })}>
                {t('rules.import')}
              </button>
            </div>
          )}
          {duplicates.map(([a, b]) => (
            <div key={`${a}:${b}`} className="rules-alert">
              {t('rules.duplicate', { a: name(a), b: name(b) })}{' '}
              <button className="link" onClick={() => send({ type: 'mergeRules', keep: a, drop: b })}>
                {t('rules.merge')}
              </button>
            </div>
          ))}
          {problems.map((f) => (
            <div key={f.path} className="rules-alert">
              {t(f.state === 'edited' ? 'rules.editedHint' : 'rules.unmanagedHint', { path: f.path })}{' '}
              <button className="link" onClick={() => send({ type: 'compareRuleFile', path: f.path })}>
                {t('rules.compare')}
              </button>{' '}
              ·{' '}
              <button className="link" onClick={() => send({ type: 'overwriteRuleFile', path: f.path })}>
                {t('rules.overwrite')}
              </button>
            </div>
          ))}
          {rules.length === 0 && <p className="muted">{t('rules.empty')}</p>}
          {scopes.map((scope) => (
            <div key={scope || '.'}>
              <div className="rules-group">
                <span>{scope ? t('rules.scopeFolder', { scope }) : t('rules.scopeAll')}</span>
              </div>
              {rules
                .filter((r) => r.rule.scope === scope)
                .map((r) => {
                  const st = fileState(r.id);
                  return (
                    <button key={r.id} className={`rule-row${r.id === current?.id ? ' selected' : ''}`} onClick={() => setSelected(r.id)}>
                      <span className="rule-row-title">
                        {r.name}
                        {st !== 'none' && <span className={`badge ${st}`}>{t(st === 'ok' ? 'rules.synced' : 'rules.check')}</span>}
                      </span>
                      <span className="rule-tools">
                        {TOOL_IDS.map((tool) => (
                          <span key={tool} className={`rule-tool${r.rule.tools.includes(tool) ? '' : ' off'}`}>
                            {t(`tool.${tool}`)}
                          </span>
                        ))}
                      </span>
                    </button>
                  );
                })}
            </div>
          ))}
        </aside>
        {current && <RuleDetail key={current.id} rule={current} files={files.filter((f) => f.ruleIds.includes(current.id))} onOpenDoc={onOpenDoc} />}
      </div>
    </div>
  );
}

function RuleDetail({ rule, files, onOpenDoc }: { rule: RuleDoc; files: RuleFileView[]; onOpenDoc: (id: string) => void }) {
  const t = useT();
  const [scope, setScope] = useState(rule.rule.scope);
  const toggle = (tool: ToolId) => {
    const tools = rule.rule.tools.includes(tool) ? rule.rule.tools.filter((x) => x !== tool) : [...rule.rule.tools, tool];
    send({ type: 'updateRule', id: rule.id, tools });
  };
  return (
    <section className="rules-main">
      <div className="rules-head">
        <h2>{rule.name}</h2>
        <code>{rule.path}</code>
      </div>
      <div className="rules-fields">
        <span className="muted">{t('rules.tools')}</span>
        {TOOL_IDS.map((tool) => (
          <label key={tool} className="inline">
            <input type="checkbox" checked={rule.rule.tools.includes(tool)} onChange={() => toggle(tool)} />
            {t(`tool.${tool}`)}
          </label>
        ))}
        <label className="inline">
          <span className="muted">{t('rules.scope')}</span>
          <input
            value={scope}
            placeholder={t('rules.scopeAll')}
            onChange={(e) => setScope(e.target.value)}
            onBlur={() => scope !== rule.rule.scope && send({ type: 'updateRule', id: rule.id, scope })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        </label>
      </div>
      <div className="rules-actions">
        <button className="primary" onClick={() => onOpenDoc(rule.id)}>
          {t('rules.edit')}
        </button>
        <button onClick={() => send({ type: 'openSharedDoc', id: rule.id })}>{t('detail.openInEditor')}</button>
        <button onClick={() => send({ type: 'renameSharedDoc', id: rule.id })}>{t('rules.rename')}</button>
        <span className="spacer" />
        <button className="danger" onClick={() => send({ type: 'removeRule', id: rule.id })}>
          {t('rules.remove')}
        </button>
      </div>
      <h3 className="rules-files-title">{t('rules.files')}</h3>
      {files.length === 0 && <p className="muted">{t('rules.noFiles')}</p>}
      {files.map((f) => (
        <div key={f.path} className="rule-file">
          <div className="rule-file-head">
            <button className="link" onClick={() => send({ type: 'openRuleFile', path: f.path })}>
              <code>{f.path}</code>
            </button>
            <span className="muted">{t(`tool.${f.tool}`)}</span>
            <span className={`badge ${f.state === 'ok' ? 'ok' : 'warn'}`}>{t(`rules.state.${f.state}`)}</span>
          </div>
          <div className="muted rule-file-how">{t(`rules.how.${f.tool}`)}</div>
          {f.ruleIds.length > 1 && <div className="muted rule-file-how">{t('rules.sharedFile', { n: f.ruleIds.length })}</div>}
        </div>
      ))}
    </section>
  );
}
