import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react';
import { localDate, overdueDays } from '../core/board';
import { formatProgress } from '../core/checklist';
import { KANBAN_STATUSES, type Card, type Category, type KanbanStatus, type RunStatus, type ToolId } from '../core/types';
import type { BoardState, CardSession } from '../shared/protocol';
import { categoriesOf, matchesFilter, placedCards, shortDate, type BoardFilter, type Placed } from './cards';
import { send, useT } from './vscode';

type Props = { state: BoardState; filter: BoardFilter; onSelect: (dir: string) => void };

/** 한 카드에 보이는 에이전트 칩 수 (DS-9) */
const MAX_CHIPS = 3;

export function Board({ state, filter, onSelect }: Props) {
  const t = useT();
  const [dropAt, setDropAt] = useState<{ status: KanbanStatus; index: number }>();
  const [dragging, setDragging] = useState<string>();
  const focusAfterRender = useRef<string | undefined>(undefined);
  const categories = state.board?.categories ?? [];
  const all = placedCards(state);
  const byId = new Map(all.map((c) => [c.card.id, c.card]));
  const byDir = new Map(all.map((c) => [c.card.id, c.dir]));
  const today = localDate(new Date());
  // DS-6: 열 제목 개수와 키보드·드래그 위치는 필터를 적용한 목록 기준이다.
  const cards = all.filter((c) => matchesFilter(c, filter, categories));
  const columns = Object.fromEntries(
    KANBAN_STATUSES.map((s) => [s, cards.filter((c) => c.card.status === s).sort((a, b) => a.card.order - b.card.order)]),
  ) as Record<KanbanStatus, Placed[]>;

  useEffect(() => {
    const id = focusAfterRender.current;
    if (!id) return;
    // 키보드 이동 후 새 state로 다시 그려지면 같은 카드에 포커스를 돌려준다.
    document.querySelector<HTMLElement>(`[data-card-id="${CSS.escape(id)}"]`)?.focus();
    focusAfterRender.current = undefined;
  }, [state]);

  const moveTo = (id: string, status: KanbanStatus, index: number) => {
    const list = columns[status].filter((c) => c.card.id !== id);
    send({ type: 'moveCard', id, to: status, beforeId: list[index - 1]?.card.id, afterId: list[index]?.card.id });
  };

  const onKeyDown = (e: KeyboardEvent, view: Placed) => {
    const { status, id } = view.card;
    const col = columns[status];
    const index = col.findIndex((c) => c.card.id === id);
    const statusIndex = KANBAN_STATUSES.indexOf(status);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(view.dir);
      return;
    }
    if (!e.altKey) return;
    let target: { status: KanbanStatus; index: number } | undefined;
    if (e.key === 'ArrowLeft' && statusIndex > 0) target = { status: KANBAN_STATUSES[statusIndex - 1]!, index: Infinity };
    if (e.key === 'ArrowRight' && statusIndex < KANBAN_STATUSES.length - 1)
      target = { status: KANBAN_STATUSES[statusIndex + 1]!, index: Infinity };
    if (e.key === 'ArrowUp' && index > 0) target = { status, index: index - 1 };
    if (e.key === 'ArrowDown' && index < col.length - 1) target = { status, index: index + 1 };
    if (!target) return;
    e.preventDefault();
    focusAfterRender.current = id;
    const len = columns[target.status].filter((c) => c.card.id !== id).length;
    moveTo(id, target.status, Math.min(target.index, len));
  };

  const dropIndex = (e: DragEvent): number => {
    const els = Array.from((e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[data-card-id]')).filter(
      (el) => !el.classList.contains('dragging'),
    );
    const i = els.findIndex((el) => {
      const r = el.getBoundingClientRect();
      return e.clientY < r.top + r.height / 2;
    });
    // 끌고 있는 카드를 뺀 목록 기준의 위치 (moveTo도 같은 목록을 쓴다)
    return i === -1 ? els.length : i;
  };

  return (
    <div className="board">
      {KANBAN_STATUSES.map((status) => (
        <section
          key={status}
          className="column"
          aria-label={t(`status.${status}`)}
          onDragOver={(e) => {
            e.preventDefault();
            setDropAt({ status, index: dropIndex(e) });
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(undefined);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const id = e.dataTransfer.getData('text/plain');
            setDropAt(undefined);
            setDragging(undefined);
            if (id) moveTo(id, status, dropIndex(e));
          }}
        >
          <header className="column-header">
            <span>
              {t(`status.${status}`)}
              {status === 'done' && filter.doneSince && (
                <span className="muted"> · {t('column.since', { date: shortDate(filter.doneSince) })}</span>
              )}
            </span>
            <span className="count">{columns[status].length}</span>
          </header>
          <div className="column-body">
            {(() => {
              // 표시선 위치는 끌고 있는 카드를 뺀 순서로 센다 (dropIndex와 같은 기준).
              let index = 0;
              const rest = columns[status].filter((c) => c.card.id !== dragging).length;
              return (
                <>
                  {columns[status].map((view) => {
                    const at = view.card.id === dragging ? -1 : index++;
                    return (
                      <div key={view.dir}>
                        {dropAt?.status === status && dropAt.index === at && <div className="drop-line" />}
                        <CardTile
                          view={view}
                          categories={categories}
                          today={today}
                          dependency={(id) => byId.get(id)}
                          openCard={(id) => {
                            const dir = byDir.get(id);
                            if (dir) onSelect(dir);
                          }}
                          onSelect={onSelect}
                          onKeyDown={onKeyDown}
                          onDragState={(on) => setDragging(on ? view.card.id : undefined)}
                        />
                      </div>
                    );
                  })}
                  {dropAt?.status === status && dropAt.index >= rest && <div className="drop-line" />}
                </>
              );
            })()}
            {status === 'todo' && <NewCard />}
          </div>
        </section>
      ))}
    </div>
  );
}

function CardTile({
  view,
  categories,
  today,
  dependency,
  openCard,
  onSelect,
  onKeyDown,
  onDragState,
}: {
  view: Placed;
  categories: Category[];
  today: string;
  dependency: (id: string) => Card | undefined;
  openCard: (id: string) => void;
  onSelect: (dir: string) => void;
  onKeyDown: (e: KeyboardEvent, view: Placed) => void;
  onDragState: (dragging: boolean) => void;
}) {
  const t = useT();
  const { card, progress } = view;
  const cats = categoriesOf(view, categories);
  const overdue = overdueDays(card, today);
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
  const deps = (card.dependsOn ?? []).map((id) => ({ id, card: dependency(id) })).filter((d) => d.card);
  return (
    <article
      className="card"
      data-card-id={card.id}
      tabIndex={0}
      draggable
      title={t('card.moveHint')}
      onClick={() => onSelect(view.dir)}
      onKeyDown={(e) => onKeyDown(e, view)}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', card.id);
        e.dataTransfer.effectAllowed = 'move';
        e.currentTarget.classList.add('dragging');
        onDragState(true);
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('dragging');
        onDragState(false);
      }}
    >
      <div className="card-head">
        <span className="card-title">{card.title}</span>
        <span className="card-id">{card.id}</span>
      </div>
      <div className="card-progress" aria-label={t('detail.progress')}>
        {progress.total > 0 && (
          <div className="bar small">
            <div className="bar-fill accent" style={{ width: `${pct}%` }} />
          </div>
        )}
        <span className="card-count">{formatProgress(progress)}</span>
      </div>
      {cats.length > 0 && (
        <div className="card-line">
          {cats.map((c, i) => (
            <span key={c.tag} className="cat-tag">
              {i > 0 && <span className="sep">·</span>}
              <i className={`dot cat-${c.color}`} aria-hidden />
              {c.name}
            </span>
          ))}
        </div>
      )}
      {(card.startDate || card.dueDate) && (
        <div className="card-line muted">
          {card.startDate && <span>{t('card.start', { date: shortDate(card.startDate) })}</span>}
          {card.dueDate && overdue > 0 && (
            <span className="overdue" title={t('card.overdueTitle', { n: overdue })}>
              {card.startDate && ' · '}
              {t('card.overdue', { n: overdue })}
            </span>
          )}
          {card.dueDate && overdue === 0 && card.status !== 'done' && (
            <span>
              {card.startDate && ' · '}
              {t('card.due', { date: shortDate(card.dueDate) })}
            </span>
          )}
        </div>
      )}
      {deps.map(({ id, card: dep }) => (
        <button
          key={id}
          className={`card-dep${dep!.status === 'done' ? '' : ' open'}`}
          title={dep!.status === 'done' ? dep!.id : t('card.dependsOpen')}
          onClick={(e) => {
            e.stopPropagation();
            openCard(id);
          }}
        >
          <span aria-hidden>⛓ </span>
          {t('card.depends', { title: dep!.title })}
        </button>
      ))}
      <AgentChips dir={view.dir} sessions={view.sessions} />
      {(view.rereviewRequired || view.duplicate || card.manualDone || view.worktreeMissing) && (
        <div className="card-badges">
          {view.rereviewRequired && <span className="badge warn">{t('card.rereview')}</span>}
          {view.duplicate && <span className="badge error">{t('card.duplicate')}</span>}
          {card.manualDone && <span className="badge">{t('card.manualDone')}</span>}
          {view.worktreeMissing && <span className="badge warn">{t('detail.worktreeMissing')}</span>}
        </div>
      )}
    </article>
  );
}

const TOOL_GLYPH: Record<ToolId, string> = { claude: '✳', codex: '◎', cursor: '➤' };

/** DS-9: 상태 점 색 */
function dotTone(status: RunStatus): string {
  if (status === 'running') return 'ok';
  if (status === 'input_required' || status === 'stopping') return 'warn';
  if (status === 'error' || status === 'unknown') return 'error';
  return 'idle';
}

/** DS-9: 에이전트 칩. 누르면 그 세션을 연다. */
function AgentChips({ dir, sessions }: { dir: string; sessions: CardSession[] }) {
  const t = useT();
  if (sessions.length === 0) return null;
  const shown = sessions.slice(0, MAX_CHIPS);
  return (
    <div className="chips-row">
      {shown.map((s, i) => {
        const body = (
          <>
            <span className="glyph" aria-hidden>
              {TOOL_GLYPH[s.tool]}
            </span>
            {s.tool}
            <i className={`status-dot ${dotTone(s.status)}`} aria-label={t(`run.${s.status}`)} />
          </>
        );
        const title = `${t(`tool.${s.tool}`)} · ${t(`run.${s.status}`)}`;
        const sessionId = s.sessionId;
        return sessionId ? (
          <button
            key={`${s.tool}:${sessionId}`}
            className="agent-chip"
            title={`${title} · ${t('card.openSession')} (${sessionId.slice(0, 8)})`}
            onClick={(e) => {
              e.stopPropagation();
              send({ type: 'openSession', dir, tool: s.tool, sessionId });
            }}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {body}
          </button>
        ) : (
          <span key={`${s.tool}:${i}`} className="agent-chip" title={title}>
            {body}
          </span>
        );
      })}
      {sessions.length > MAX_CHIPS && <span className="agent-chip more">{t('card.more', { n: sessions.length - MAX_CHIPS })}</span>}
    </div>
  );
}

function NewCard() {
  const t = useT();
  const [title, setTitle] = useState('');
  const submit = () => {
    if (!title.trim()) return;
    send({ type: 'createCard', title });
    setTitle('');
  };
  return (
    <form
      className="new-card"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        value={title}
        placeholder={`+ ${t('card.new')}`}
        aria-label={t('card.titlePlaceholder')}
        onChange={(e) => setTitle(e.target.value)}
      />
      {title && <button type="submit">{t('card.add')}</button>}
    </form>
  );
}
