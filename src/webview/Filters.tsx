import type { BoardState } from '../shared/protocol';
import { daysAgo, needsAttention, placedCards, type BoardFilter } from './cards';
import { BellIcon } from './icons';
import { useT } from './vscode';

/** TASK-2 DS-3, DS-4: 구분 칩과 Done 열 완료 시작일 */
export function Filters({ state, filter, onChange }: { state: BoardState; filter: BoardFilter; onChange: (f: BoardFilter) => void }) {
  const t = useT();
  const categories = state.board?.categories ?? [];
  const attention = placedCards(state).filter(needsAttention).length;
  return (
    <div className="filters">
      {(attention > 0 || filter.attention) && (
        <button
          className={`chip attention${filter.attention ? ' active' : ''}`}
          aria-pressed={!!filter.attention}
          onClick={() => onChange({ ...filter, attention: !filter.attention || undefined })}
        >
          <BellIcon />
          {t('filter.attention', { n: attention })}
        </button>
      )}
      <div className="chips" role="radiogroup" aria-label={t('filter.categories')}>
        <button
          role="radio"
          aria-checked={!filter.category}
          className={`chip${!filter.category ? ' active' : ''}`}
          onClick={() => onChange({ ...filter, category: undefined })}
        >
          {t('filter.all')}
        </button>
        {categories.map((c) => (
          <button
            key={c.tag}
            role="radio"
            aria-checked={filter.category === c.tag}
            className={`chip${filter.category === c.tag ? ' active' : ''}`}
            onClick={() => onChange({ ...filter, category: c.tag })}
          >
            <i className={`dot cat-${c.color}`} aria-hidden />
            {c.name}
          </button>
        ))}
      </div>
      <label className="done-since">
        <span className="muted">{t('filter.doneSince')}</span>
        <input type="date" value={filter.doneSince ?? ''} onChange={(e) => onChange({ ...filter, doneSince: e.target.value || undefined })} />
      </label>
      <button className="chip" onClick={() => onChange({ ...filter, doneSince: daysAgo(7) })}>
        {t('filter.last7')}
      </button>
    </div>
  );
}
