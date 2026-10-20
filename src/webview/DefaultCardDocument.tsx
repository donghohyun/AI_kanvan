import { completedAt, localDate, overdueDays } from '../core/board';
import { formatProgress } from '../core/checklist';
import type { BoardState, CardView } from '../shared/protocol';
import { categoriesOf, placedCards, shortDate } from './cards';
import { renderBlock } from './canvas/markdown';
import { documentBlocks } from './canvas/markdownParse';
import { Callout, Grid, H1, H2, Stack, Stat, Text } from './canvas/ui';
import { useT } from './vscode';

export interface CardDocs {
  intent?: string;
  spec?: string;
  plan?: string;
}

/**
 * canvas.tsx가 없는 카드의 기본 문서. 카드 데이터와 intent·spec·plan으로 canvas 스타일 문서를 만든다.
 * canvas 컴포넌트를 쓰므로 CanvasFrame 안에서 그린다.
 */
export function DefaultCardDocument({ view, state, docs }: { view: CardView; state: BoardState; docs: CardDocs }) {
  const t = useT();
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
    card.workspace?.branch ?? t('page.noBranch'),
    card.startDate && t('card.start', { date: shortDate(card.startDate) }),
    card.dueDate && t('card.due', { date: shortDate(card.dueDate) }),
    card.status === 'done' && completedAt(card) && `${t('status.done')} ${localDate(completedAt(card)!)}`,
  ].filter(Boolean);

  const sections: { title: string; source?: string }[] = [
    { title: t('doc.intent'), source: docs.intent },
    { title: t('doc.spec'), source: docs.spec },
    { title: t('doc.plan'), source: docs.plan },
  ];

  return (
    <Stack gap={20}>
      <Stack gap={8}>
        <Text size="small" tone="tertiary">
          {meta.join(' · ')}
        </Text>
        <H1>{card.title}</H1>
        {card.description && <Text tone="secondary">{card.description}</Text>}
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

      {sections.map(({ title, source }) => {
        const blocks = source ? documentBlocks(source, { skipTitle: true, demote: 1 }) : [];
        if (blocks.length === 0) return null;
        return (
          <Stack key={title} gap={10}>
            <H2>{title}</H2>
            {blocks.map(renderBlock)}
          </Stack>
        );
      })}
    </Stack>
  );
}
