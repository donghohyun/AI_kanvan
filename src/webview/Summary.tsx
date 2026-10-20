import { boardMetrics, categoryProgress } from '../core/board';
import type { BoardState } from '../shared/protocol';
import { placedCards } from './cards';
import { useT } from './vscode';

/** TASK-2 DS-1: 상단 요약 지표. 필터와 상관없이 보드 전체 기준이다. */
export function Summary({ state }: { state: BoardState }) {
  const t = useT();
  const m = boardMetrics(placedCards(state));
  const rate = m.items.total ? `${Math.round((m.items.done / m.items.total) * 100)}%` : '—';
  const metrics = [
    { value: rate, label: t('summary.rate'), tone: 'accent' },
    { value: `${m.items.done}/${m.items.total}`, label: t('summary.items'), tone: '' },
    { value: m.todo, label: t('summary.todo'), tone: '' },
    { value: m.active, label: t('summary.active'), tone: 'accent' },
    { value: m.done, label: t('summary.done'), tone: 'ok' },
  ];
  return (
    <section className="summary" aria-label={t('summary.rate')}>
      {metrics.map((x) => (
        <div key={x.label} className="metric">
          <div className={`metric-value ${x.tone}`}>{x.value}</div>
          <div className="metric-label">{x.label}</div>
        </div>
      ))}
    </section>
  );
}

/** TASK-2 DS-2: 구분별 항목 완료 */
export function CategoryBars({ state }: { state: BoardState }) {
  const t = useT();
  const rows = categoryProgress(placedCards(state), state.board?.categories ?? []);
  if (rows.length === 0) return null;
  return (
    <section className="category-bars">
      <h2 className="section-title">{t('summary.categories')}</h2>
      {rows.map((row) => {
        const name = row.category?.name ?? t('summary.unclassified');
        const pct = row.progress.total ? (row.progress.done / row.progress.total) * 100 : 0;
        return (
          <div key={row.category?.tag ?? ''} className="category-row">
            <div className="category-row-head">
              <span>{t('summary.categoryRow', { name })}</span>
              <span className="muted">{t('summary.doneOf', { done: row.progress.done, total: row.progress.total })}</span>
            </div>
            <div
              className="bar"
              role="progressbar"
              aria-label={name}
              aria-valuemin={0}
              aria-valuemax={row.progress.total}
              aria-valuenow={row.progress.done}
            >
              <div className={`bar-fill ${row.category ? `cat-${row.category.color}` : 'cat-none'}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
