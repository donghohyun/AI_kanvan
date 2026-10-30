import { completedAt, localDate, overdueDays } from '../core/board';
import { formatProgress } from '../core/checklist';
import { TASK_DOCS } from '../core/types';
import type { BoardState, CardView } from '../shared/protocol';
import { categoriesOf, placedCards, shortDate } from './cards';
import { Callout, Grid, H2, Stack, Stat, Text } from './canvas/ui';
import { useHostTheme } from './canvas/host';
import { canvasTypography } from './canvas/theme';
import { EditableField, EditableMarkdown } from './DocEditing';
import { send, useT } from './vscode';

const DOC_OPTIONS = { skipTitle: true, demote: 1 };

export interface CardDocs {
  intent?: string;
  spec?: string;
  plan?: string;
}

/**
 * 카드 문서. 카드 데이터와 intent·spec·plan으로 canvas 스타일 문서를 만든다.
 * md의 ```canvas 이름``` 블록에는 canvas.tsx의 그림이 들어간다. canvas 컴포넌트를 쓰므로 CanvasFrame 안에서 그린다.
 */
export function DefaultCardDocument({ view, state, docs }: { view: CardView; state: BoardState; docs: CardDocs }) {
  const t = useT();
  const theme = useHostTheme();
  const card = view.card;
  if (!card) return null;
  const categories = state.board?.categories ?? [];
  const cats = categoriesOf(view, categories);
  const today = localDate(new Date());
  const overdue = overdueDays(card, today);
  const byId = new Map(placedCards(state).map((c) => [c.card.id, c.card]));
  const deps = (card.dependsOn ?? []).map((id) => byId.get(id)).filter((c) => !!c);
  const openDeps = deps.filter((c) => c.status !== 'done');
  const rate = view.progress.total ? `${Math.round((view.progress.done / view.progress.total) * 100)}%` : '—';

  const meta = [
    card.id,
    t(`status.${card.status}`),
    card.page,
    card.workspace?.branch ?? t('page.noBranch'),
    card.startDate && t('card.start', { date: shortDate(card.startDate) }),
    card.dueDate && t('card.due', { date: shortDate(card.dueDate) }),
    card.status === 'done' && completedAt(card) && `${t('status.done')} ${localDate(completedAt(card)!)}`,
  ].filter(Boolean);

  const sections = TASK_DOCS.map((doc) => ({ doc, title: t(`doc.${doc}`), source: docs[doc] }));

  return (
    <Stack gap={20}>
      <Stack gap={8}>
        <Text size="small" tone="tertiary">
          {meta.join(' · ')}
        </Text>
        <EditableField
          value={card.title}
          style={{ ...canvasTypography.h1, margin: 0 }}
          onCommit={(title) => title.trim() && send({ type: 'updateCard', id: card.id, patch: { title: title.trim() } })}
        />
        <EditableField
          value={card.description ?? ''}
          multiline
          placeholder={t('edit.descriptionPlaceholder')}
          style={{ ...canvasTypography.body, color: theme.text.secondary }}
          onCommit={(description) => send({ type: 'updateCard', id: card.id, patch: { description } })}
        />
      </Stack>

      <Grid columns="repeat(auto-fit, minmax(140px, 1fr))" gap={16}>
        <Stat value={rate} label={`${t('summary.rate')} (${formatProgress(view.progress)})`} tone={view.progress.total && view.progress.done === view.progress.total ? 'success' : 'info'} />
        {cats.slice(0, 3).map((c) => {
          const p = view.tags[c.tag.toLowerCase()]!;
          return <Stat key={c.tag} value={`${p.done}/${p.total}`} label={t('summary.categoryRow', { name: c.name })} />;
        })}
        {overdue > 0 && <Stat value={t('card.overdue', { n: overdue })} label={t('card.overdueTitle', { n: overdue })} tone="danger" />}
      </Grid>

      {deps.length > 0 && (
        <Callout tone={openDeps.length ? 'warning' : 'success'} title={t('detail.dependsOn')}>
          {deps.map((d) => `${d.id} ${d.title} (${t(`status.${d.status}`)})`).join(' · ')}
        </Callout>
      )}

      {sections.map(({ doc, title, source }) => (
        <Stack key={doc} gap={10}>
          <H2>{title}</H2>
          <EditableMarkdown dir={view.dir} target={doc} source={source ?? ''} options={DOC_OPTIONS} />
        </Stack>
      ))}
    </Stack>
  );
}
