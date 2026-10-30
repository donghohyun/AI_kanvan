import { boardMetrics, categoryProgress } from '../core/board';
import type { BoardState } from '../shared/protocol';
import { UNSORTED_PAGE, pageList, placedCards, type BoardFilter } from './cards';
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

/** 페이지별 카드 수. 누르면 칸반을 그 페이지로 거른다. Done이 아닌 카드가 있는 페이지만 보인다. */
export function PageBars({ state, filter, onChange }: { state: BoardState; filter: BoardFilter; onChange: (f: BoardFilter) => void }) {
  const t = useT();
  const cards = placedCards(state);
  const rows = pageList(state)
    .map((page) => {
      const own = cards.filter((c) => (c.card.page ?? UNSORTED_PAGE) === page);
      const active = own.filter((c) => c.card.status === 'in_progress' || c.card.status === 'review').length;
      const open = own.filter((c) => c.card.status !== 'done').length;
      return { page, active, open, total: own.length };
    })
    .filter((r) => r.open > 0);
  if (rows.length === 0) return null;
  return (
    <section className="page-bars">
      <h2 className="section-title">{t('summary.pages')}</h2>
      <div className="page-grid">
        {rows.map((r) => (
          <button
            key={r.page}
            className={`page-cell${filter.page === r.page ? ' active' : ''}`}
            aria-pressed={filter.page === r.page}
            onClick={() => onChange({ ...filter, page: filter.page === r.page ? undefined : r.page })}
          >
            <span className="page-name">{r.page === UNSORTED_PAGE ? t('page.unsorted') : r.page}</span>
            <span className="muted small">{t('summary.pageRow', { active: r.active, total: r.total })}</span>
          </button>
        ))}
      </div>
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
