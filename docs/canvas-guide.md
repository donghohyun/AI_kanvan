# Agent Board canvas guide

Agent Board shows every card and shared doc as a document in the board. Text and pictures live in different files:

- **Text is Markdown.** A card's text is its `intent.md`, `spec.md` and `plan.md`. A shared doc's text is its `.md` file. Never copy this text into code.
- **Figures are a canvas file.** Diagrams, charts and at-a-glance comparisons are React components in a canvas file, written with `cursor/canvas` components. A card's figures file is `.agent-board/tasks/<CARD-ID>/canvas.tsx`. A shared doc `docs/<name>.md` uses `docs/<name>.canvas.tsx`.
- **Reference pages are a canvas file with a default export.** Structured references that repeat the same shape many times (an API reference, an ERD) can be one page component: put the entries in a data array and render them with one component. Use this only when the content is mostly repeated structure.

The canvas format is compatible with Cursor canvases: if Cursor is installed, its canvas skill describes the same `cursor/canvas` API.

## Figures

Write each figure as a named export whose name starts with a capital letter. Do not add a default export to a figures file: a default export turns the file into a full page.

```tsx
import { BarChart } from "cursor/canvas";

export function ProgressByArea() {
  return <BarChart categories={["BE", "FE"]} series={[{ name: "Done", data: [12, 7] }]} />;
}
```

Place it in the Markdown where it belongs:

````md
## Progress

```canvas ProgressByArea
```
````

Other viewers show the block as a short code block, so the Markdown still reads well on GitHub.

Add a figure only when a picture says it better than text: a flow or dependency as boxes and arrows, a chart, a comparison grid. Everything else stays in Markdown.

## Markdown features

Besides headings, lists, task lists, tables, code and quotes, the board renders:

- ```` ```canvas Name ```` blocks: the figure `Name` from the figures file.
- `<details><summary>Title</summary> … </details>`: a collapsible section (`<details open>` starts open). Leave a blank line after `<summary>…</summary>`.
- `## [BE] Title` in plan.md: the `[BE]` tag is a category and is shown as a badge.

## File rules

- Import only from `cursor/canvas` (components, hooks, React hooks). Type-only imports from `react` are allowed. No npm packages, relative imports, or Node built-ins.
- Put all data inline. No `fetch()` or other network calls; the document runs offline.
- Never render placeholders ("TODO", "No data", empty tables). Omit what has no real content.
- Write visible text as plain string literals, in JSX or in data arrays, not built by joining strings. People edit text in the board by clicking it, which works only for text written literally in the code.

## Reference pages

A page component is the default export. Keep the entries as data and the layout in one component, for example an API reference:

- one data array of entries, each with a group, a name, a summary, a request and a response;
- a search box (`TextInput` with `useCanvasState`) that filters entries;
- entries grouped under `H2` headings, each in a `CollapsibleSection` with the method or kind as a `Pill`;
- inside each entry, a `Request` and a `Response` part: a syntax block and tables of fields (name, type, required, description).

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
| `computeDAGLayout({ nodes, edges, direction? ("vertical"·"horizontal"), nodeWidth?, nodeHeight?, rankGap?, nodeGap?, padding? })` | Layout math for diagrams: returns `nodes` (`x`, `y`, `rank`, `order`), `edges` (`sourceX/Y`, `targetX/Y`, `isBackEdge`), `width`, `height`. You draw the SVG |
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

## When a figure or page fails to render

Agent Board shows the error in place of the figure (or on the document tab for a page) and sends it to the card's implementer session. Fix the canvas file and save; the document re-renders within a second.
