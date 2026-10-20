# Agent Board canvas guide

A card's document is a single React file at `.agent-board/tasks/<CARD-ID>/canvas.tsx`. Agent Board compiles it and renders it full-screen when someone opens the card. Without this file the board shows a default document built from intent.md, spec.md and plan.md, so write a canvas when the card needs more than that: diagrams, comparisons, decisions at a glance. Shared docs can be canvases too (`docs/<name>.canvas.tsx`). The format is compatible with Cursor canvases: if Cursor is installed, its canvas skill describes the same `cursor/canvas` API.

## File rules

- Write exactly one file: `.agent-board/tasks/<CARD-ID>/canvas.tsx`. No helper files.
- Import only from `cursor/canvas` (components, hooks, React hooks). Type-only imports from `react` are allowed. No npm packages, relative imports, or Node built-ins.
- Default-export the top-level component.
- Put all data inline. No `fetch()` or other network calls; the document runs offline.
- Never render placeholders ("TODO", "No data", empty tables). Omit a section that has no real content.

## What a card document should show

Lead with what matters most for the task, then supporting detail:

1. A short header line (status, branch, key dates), the title (`H1`) and a one-paragraph summary.
2. The few facts a reader must know first: a row of `Stat`s or short labeled phrases.
3. Decisions, boundaries or risks in a `Callout`.
4. Structured detail in `Table`s under `H2` headings.
5. A diagram when a flow, dependency or branch structure is easier to read as boxes and arrows.
6. Remaining work as a `TodoList` that mirrors plan.md.

## Components

Layout and text

| Component | Main props |
| --- | --- |
| `Stack` | `gap`, `style` — vertical column; use as the page wrapper |
| `Row` | `gap`, `align`, `justify` (`start`·`center`·`end`·`space-between`), `wrap` |
| `Grid` | `columns` (number or CSS template), `gap`, `align` |
| `Spacer`, `Divider` | — |
| `H1`, `H2`, `H3` | children — one `H1` per document |
| `Text` | `tone` (`primary`·`secondary`·`tertiary`·`quaternary`), `size` (`body`·`small`), `weight`, `italic`, `truncate`, `as`. Backtick code and `[label](url)` links inside strings are rendered |
| `Code`, `Link` | inline code; `Link` needs `href` (http/https opens in the browser) |

Surfaces and data

| Component | Main props |
| --- | --- |
| `Card` + `CardHeader` + `CardBody` | `variant` (`default`·`borderless`), `size`, `collapsible`, `defaultOpen`; `CardHeader` takes plain text and an optional `trailing` |
| `CollapsibleSection` | `title`, `leading`, `count`, `trailing`, `defaultOpen` |
| `Table` | `headers`, `rows`, `columnAlign`, `rowTone`, `striped`, `framed` — do not wrap in a Card |
| `Stat` | `value`, `label`, `tone` (`success`·`danger`·`warning`·`info`) |
| `Callout` | `tone` (`info`·`success`·`warning`·`danger`·`neutral`), `title`, `icon` |
| `Pill` | `active`, `size` (`sm`·`md`), `onClick` |
| `Button` | `variant` (`primary`·`secondary`·`ghost`), `onClick` |
| `TodoList`, `TodoListCard` | `todos: { id, content, status: 'pending'·'in_progress'·'completed'·'cancelled' }[]` |
| `UsageBar` | `segments: { id, value, color? }[]`, `total`, `topLeftLabel`, `topRightLabel` |
| `Swatch` | `color` (`gray`·`purple`·`green`·`yellow`·`cyan`·`pink`·`blue`·`orange`·`red`) |
| `DiffView`, `DiffStats` | `lines: { type: 'added'·'removed'·'unchanged', content, lineNumber? }[]`; `additions`, `deletions` |
| `BarChart`, `LineChart` | `categories`, `series: { name, data, tone? }[]`, `stacked`, `horizontal`, `normalized`, `fill`, `valueSuffix`, `referenceLines` |
| `PieChart` | `data: { label, value, tone? }[]`, `donut`, `size` |
| `TextInput`, `TextArea`, `Checkbox`, `Toggle`, `Select`, `IconButton` | controlled; `onChange` receives the value, not an event |

Hooks and helpers

| Export | Use |
| --- | --- |
| `useHostTheme()` | Colors that follow the editor theme: `text.primary/secondary/tertiary/quaternary/link/onAccent`, `bg.editor/chrome/elevated`, `fill.primary…quaternary`, `stroke.primary/secondary/tertiary/focused`, `accent.primary/control`, `category.<color>`. Call it inside each component that needs colors |
| `useCanvasState(key, initial)` | Like `useState`, but kept for this card on this machine |
| `useCanvasAction()` | `dispatch({ type: 'openFile', path })` opens a repository file; `{ type: 'newComposerChat', userPrompt }` sends a request to the card's implementer agent |
| `computeDAGLayout({ nodes, edges, direction?, nodeWidth?, nodeHeight?, rankGap?, nodeGap?, padding? })` | Layout math for diagrams: returns `nodes` (`x`, `y`, `rank`, `order`), `edges` (`sourceX/Y`, `targetX/Y`, `isBackEdge`), `width`, `height`. You draw the SVG |
| `useState`, `useMemo`, `useEffect`, `useRef`, `mergeStyle` | re-exported for convenience |

## Diagram recipe

```tsx
import { computeDAGLayout, useHostTheme } from "cursor/canvas";

function Flow({ nodes, edges }: { nodes: { id: string; label: string }[]; edges: { from: string; to: string; label?: string }[] }) {
  const t = useHostTheme();
  const W = 150, H = 36;
  const layout = computeDAGLayout({ nodes, edges, nodeWidth: W, nodeHeight: H, rankGap: 48, nodeGap: 32 });
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  return (
    <svg width={layout.width} height={layout.height} role="img">
      <defs>
        <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill={t.stroke.primary} />
        </marker>
      </defs>
      {layout.edges.map((e) => (
        <line key={`${e.from}-${e.to}`} x1={e.sourceX} y1={e.sourceY} x2={e.targetX} y2={e.targetY} stroke={t.stroke.primary} markerEnd="url(#arrow)" />
      ))}
      {layout.nodes.map((n) => (
        <g key={n.id}>
          <rect x={n.x} y={n.y} width={W} height={H} rx={6} fill={t.fill.secondary} stroke={t.stroke.secondary} />
          <text x={n.x + W / 2} y={n.y + H / 2 + 4} textAnchor="middle" fontSize={12} fill={t.text.primary}>{label.get(n.id)}</text>
        </g>
      ))}
    </svg>
  );
}
```

## Design rules

- Flat and calm: no gradients, no box shadows, no emoji, no hard-coded hex colors — take every color from `useHostTheme()`.
- Give the page a clear hierarchy: one thing should stand out. Mix open sections with cards instead of wrapping everything in cards.
- Use color sparingly and with meaning (status, category). Borders are structural, not decorative.
- Keep text at or below `H1` size. Label every chart: a specific title, units, and a legend when there is more than one series.

## When the document fails to render

Agent Board shows the error on the card's document tab and sends it to the implementer session. Fix `canvas.tsx` and save; the document re-renders within a second.
