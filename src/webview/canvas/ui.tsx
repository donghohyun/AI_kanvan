// `cursor/canvas` 호환 UI 컴포넌트 (TASK-3 CV-3). 이름과 속성은 Cursor SDK 선언을 따르고, 구현은 이 프로젝트가 새로 작성했다.

import { createContext, useContext, useState, type CSSProperties, type ReactNode } from 'react';
import { useHost, useHostTheme } from './host';
import { canvasTypography, type Color } from './theme';

export function mergeStyle(base: CSSProperties, override?: CSSProperties): CSSProperties {
  return override ? { ...base, ...override } : base;
}

type Align = 'start' | 'center' | 'end' | 'stretch';
const flexAlign = (a?: Align) => (a === 'start' ? 'flex-start' : a === 'end' ? 'flex-end' : a);

// ---- 레이아웃 ----

export function Stack({ children, gap = 12, style }: { children?: ReactNode; gap?: number; style?: CSSProperties }) {
  return <div style={mergeStyle({ display: 'flex', flexDirection: 'column', gap, minWidth: 0 }, style)}>{children}</div>;
}

export function Row({
  children,
  gap = 8,
  align = 'center',
  justify,
  wrap,
  style,
}: {
  children?: ReactNode;
  gap?: number;
  align?: Align;
  justify?: 'start' | 'center' | 'end' | 'space-between';
  wrap?: boolean;
  style?: CSSProperties;
}) {
  const j = justify === 'start' ? 'flex-start' : justify === 'end' ? 'flex-end' : justify;
  return (
    <div style={mergeStyle({ display: 'flex', flexDirection: 'row', gap, alignItems: flexAlign(align), justifyContent: j, flexWrap: wrap ? 'wrap' : 'nowrap', minWidth: 0 }, style)}>
      {children}
    </div>
  );
}

export function Grid({ children, columns, gap = 12, align, style }: { children?: ReactNode; columns: number | string; gap?: number; align?: Align; style?: CSSProperties }) {
  const template = typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : columns;
  return <div style={mergeStyle({ display: 'grid', gridTemplateColumns: template, gap, alignItems: align, minWidth: 0 }, style)}>{children}</div>;
}

export function Divider({ style }: { style?: CSSProperties }) {
  const t = useHostTheme();
  return <hr style={mergeStyle({ border: 0, borderTop: `1px solid ${t.stroke.tertiary}`, margin: 0, width: '100%' }, style)} />;
}

export function Spacer() {
  return <div style={{ flex: 1 }} />;
}

// ---- 글자 ----

/** 중첩된 Text는 <span>으로 그린다. */
const InText = createContext(false);

/** `코드`, [링크](url), **굵게**를 처리한다. */
export function inlineMarkdown(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<Code key={`${key}-c${i++}`}>{m[1]}</Code>);
    else if (m[4] !== undefined) out.push(<strong key={`${key}-b${i++}`} style={{ fontWeight: 590 }}>{inlineMarkdown(m[4], `${key}-b${i}`)}</strong>);
    else out.push(<Link key={`${key}-l${i++}`} href={m[3]!}>{m[2]}</Link>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function withMarkdown(children: ReactNode): ReactNode {
  if (typeof children === 'string') return inlineMarkdown(children, 't');
  if (Array.isArray(children)) return children.map((c, i) => (typeof c === 'string' ? <span key={i}>{inlineMarkdown(c, `t${i}`)}</span> : c));
  return children;
}

const WEIGHT = { normal: 400, medium: 500, semibold: 590, bold: 700 } as const;

export function Text({
  children,
  tone = 'primary',
  size = 'body',
  as,
  weight = 'normal',
  italic,
  truncate,
  style,
}: {
  children?: ReactNode;
  tone?: 'primary' | 'secondary' | 'tertiary' | 'quaternary';
  size?: 'body' | 'small';
  as?: 'p' | 'span';
  weight?: keyof typeof WEIGHT;
  italic?: boolean;
  truncate?: boolean | 'start' | 'end';
  style?: CSSProperties;
}) {
  const t = useHostTheme();
  const nested = useContext(InText);
  const Tag = as ?? (nested ? 'span' : 'p');
  const typo = size === 'small' ? canvasTypography.small : canvasTypography.body;
  const base: CSSProperties = {
    margin: 0,
    color: t.text[tone],
    fontSize: nested && !as ? undefined : typo.fontSize,
    lineHeight: nested && !as ? undefined : typo.lineHeight,
    fontWeight: WEIGHT[weight],
    fontStyle: italic ? 'italic' : undefined,
    ...(truncate ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: truncate === 'start' ? 'rtl' : undefined } : {}),
  };
  return (
    <InText.Provider value>
      <Tag style={mergeStyle(base, style)}>{withMarkdown(children)}</Tag>
    </InText.Provider>
  );
}

function Heading({ level, children, style }: { level: 1 | 2 | 3; children?: ReactNode; style?: CSSProperties }) {
  const t = useHostTheme();
  const typo = canvasTypography[`h${level}`];
  const Tag = `h${level}` as const;
  return (
    <InText.Provider value>
      <Tag style={mergeStyle({ margin: 0, color: t.text.primary, ...typo }, style)}>{withMarkdown(children)}</Tag>
    </InText.Provider>
  );
}
export const H1 = (p: { children?: ReactNode; style?: CSSProperties }) => <Heading level={1} {...p} />;
export const H2 = (p: { children?: ReactNode; style?: CSSProperties }) => <Heading level={2} {...p} />;
export const H3 = (p: { children?: ReactNode; style?: CSSProperties }) => <Heading level={3} {...p} />;

export function Code({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  const t = useHostTheme();
  return (
    <code
      style={mergeStyle(
        { fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: '0.92em', background: t.fill.secondary, borderRadius: 4, padding: '1px 4px' },
        style,
      )}
    >
      {children}
    </code>
  );
}

/** CV-7: http·https만 외부 브라우저로 연다. */
export function Link({ children, href, style }: { children?: ReactNode; href: string; style?: CSSProperties }) {
  const host = useHost();
  return (
    <a
      href={href}
      style={mergeStyle({ color: host.theme.text.link, textDecoration: 'none' }, style)}
      onClick={(e) => {
        e.preventDefault();
        host.openLink(href);
      }}
    >
      {children}
    </a>
  );
}

// ---- 표면 ----

const CardState = createContext<{ open: boolean; toggle?: () => void; size: 'base' | 'lg' }>({ open: true, size: 'base' });

export function CanvasChevron({ expanded }: { expanded: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ transform: expanded ? 'rotate(90deg)' : undefined, transition: 'transform 120ms', flex: 'none' }}>
      <path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Card({
  children,
  variant = 'default',
  size = 'base',
  stickyHeader,
  collapsible,
  defaultOpen = true,
  open: openProp,
  onOpenChange,
  style,
}: {
  children?: ReactNode;
  variant?: 'default' | 'borderless';
  size?: 'base' | 'lg';
  stickyHeader?: boolean;
  collapsible?: boolean;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  style?: CSSProperties;
}) {
  const t = useHostTheme();
  const [inner, setInner] = useState(defaultOpen);
  const open = collapsible ? (openProp ?? inner) : true;
  const toggle = collapsible
    ? () => {
        setInner(!open);
        onOpenChange?.(!open);
      }
    : undefined;
  // stickyHeader: 카드 화면이 스크롤을 맡으므로 별도 처리하지 않는다.
  void stickyHeader;
  return (
    <CardState.Provider value={{ open, toggle, size }}>
      <section
        style={mergeStyle(
          {
            border: variant === 'borderless' ? 'none' : `1px solid ${t.stroke.tertiary}`,
            borderRadius: variant === 'borderless' ? 0 : 8,
            background: variant === 'borderless' ? 'transparent' : t.bg.elevated,
            minWidth: 0,
            overflow: 'hidden',
          },
          style,
        )}
      >
        {children}
      </section>
    </CardState.Provider>
  );
}

export function CardHeader({ children, trailing, style }: { children?: ReactNode; trailing?: ReactNode; style?: CSSProperties }) {
  const t = useHostTheme();
  const card = useContext(CardState);
  const height = card.size === 'lg' ? 32 : 28;
  const content = (
    <>
      {card.toggle && <CanvasChevron expanded={card.open} />}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      {trailing && <span style={{ color: t.text.tertiary, flex: 'none' }}>{trailing}</span>}
    </>
  );
  const base: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: height,
    padding: '0 12px',
    fontSize: 12,
    fontWeight: 500,
    color: t.text.secondary,
    borderBottom: card.open ? `1px solid ${t.stroke.tertiary}` : 'none',
  };
  return card.toggle ? (
    <button type="button" onClick={card.toggle} style={mergeStyle({ ...base, width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', font: 'inherit', fontSize: 12 }, style)}>
      {content}
    </button>
  ) : (
    <header style={mergeStyle(base, style)}>{content}</header>
  );
}

export function CardBody({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  const card = useContext(CardState);
  if (!card.open) return null;
  return <div style={mergeStyle({ padding: 12 }, style)}>{children}</div>;
}

export function CollapsibleSection({
  title,
  leading,
  count,
  trailing,
  children,
  defaultOpen = false,
  style,
}: {
  title: string;
  leading?: ReactNode;
  count?: number;
  trailing?: ReactNode;
  children?: ReactNode;
  defaultOpen?: boolean;
  style?: CSSProperties;
}) {
  const t = useHostTheme();
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={mergeStyle({ minWidth: 0 }, style)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 0', background: 'none', border: 'none', color: t.text.primary, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}
      >
        <CanvasChevron expanded={open} />
        {leading}
        <span style={{ fontWeight: 500 }}>{title}</span>
        {count !== undefined && <span style={{ color: t.text.tertiary, fontSize: 12 }}>{count}</span>}
        <span style={{ flex: 1 }} />
        {trailing && <span style={{ color: t.text.tertiary }}>{trailing}</span>}
      </button>
      {open && <div style={{ paddingLeft: 20 }}>{children}</div>}
    </div>
  );
}

// ---- 데이터 ----

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

function toneColor(t: ReturnType<typeof useHostTheme>, tone: Tone | undefined): string | undefined {
  switch (tone) {
    case 'success':
      return t.category.green;
    case 'danger':
      return t.category.red;
    case 'warning':
      return t.category.orange;
    case 'info':
      return t.category.blue;
    case 'neutral':
      return t.text.tertiary;
    default:
      return undefined;
  }
}

export function Table({
  headers,
  rows,
  columnAlign,
  rowTone,
  framed = true,
  striped,
  stickyHeader,
  style,
  emptyMessage,
}: {
  headers: ReactNode[];
  rows: ReactNode[][];
  columnAlign?: Array<'left' | 'center' | 'right' | undefined>;
  rowTone?: Array<Tone | undefined>;
  framed?: boolean;
  striped?: boolean;
  stickyHeader?: boolean;
  style?: CSSProperties;
  emptyMessage?: ReactNode;
}) {
  const t = useHostTheme();
  const cell: CSSProperties = { padding: '8px 12px', textAlign: 'left', verticalAlign: 'top', borderTop: `1px solid ${t.stroke.tertiary}`, fontSize: 13, lineHeight: '20px' };
  const table = (
    <table style={{ width: '100%', borderCollapse: 'collapse', color: t.text.primary }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th
              key={i}
              style={{
                ...cell,
                borderTop: 'none',
                fontWeight: 500,
                fontSize: 12,
                color: t.text.secondary,
                textAlign: columnAlign?.[i] ?? 'left',
                background: framed ? t.fill.quaternary : undefined,
                position: stickyHeader ? 'sticky' : undefined,
                top: 0,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && emptyMessage !== undefined && (
          <tr>
            <td colSpan={headers.length} style={{ ...cell, color: t.text.tertiary }}>
              {emptyMessage}
            </td>
          </tr>
        )}
        {rows.map((row, r) => (
          <tr key={r} style={{ background: striped && r % 2 === 1 ? t.fill.quaternary : undefined }}>
            {headers.map((_, c) => (
              <td key={c} style={{ ...cell, textAlign: columnAlign?.[c] ?? 'left' }}>
                {c === 0 && rowTone?.[r] && (
                  <span aria-hidden style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, marginRight: 8, verticalAlign: 'middle', background: toneColor(t, rowTone[r]) }} />
                )}
                {typeof row[c] === 'string' ? withMarkdown(row[c]) : row[c]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
  if (!framed) return <div style={mergeStyle({ overflowX: 'auto' }, style)}>{table}</div>;
  return <div style={mergeStyle({ border: `1px solid ${t.stroke.tertiary}`, borderRadius: 8, overflow: 'auto' }, style)}>{table}</div>;
}

export function Pill({
  children,
  active,
  size = 'md',
  leadingContent,
  keyboardHint,
  disabled,
  title,
  style,
  onClick,
}: {
  children?: ReactNode;
  active?: boolean;
  tone?: string;
  size?: 'sm' | 'md';
  leadingContent?: ReactNode;
  keyboardHint?: string;
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const t = useHostTheme();
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    height: size === 'sm' ? 18 : 22,
    padding: size === 'sm' ? '0 6px' : '0 8px',
    borderRadius: 999,
    fontSize: size === 'sm' ? 11 : 12,
    whiteSpace: 'nowrap',
    color: active ? t.text.primary : t.text.secondary,
    background: active ? t.fill.primary : size === 'sm' ? t.fill.secondary : 'transparent',
    border: size === 'sm' ? 'none' : `1px solid ${active ? 'transparent' : t.stroke.secondary}`,
    opacity: disabled ? 0.5 : 1,
    font: 'inherit',
  };
  const inner = (
    <>
      {leadingContent}
      <span>{children}</span>
      {keyboardHint && <span style={{ color: t.text.quaternary }}>{keyboardHint}</span>}
    </>
  );
  return onClick ? (
    <button type="button" title={title} disabled={disabled} onClick={onClick} style={mergeStyle({ ...base, fontSize: base.fontSize, cursor: disabled ? 'default' : 'pointer' }, style)}>
      {inner}
    </button>
  ) : (
    <span title={title} style={mergeStyle(base, style)}>
      {inner}
    </span>
  );
}

export function Button({
  children,
  variant = 'secondary',
  disabled,
  type = 'button',
  style,
  onClick,
}: {
  children?: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const t = useHostTheme();
  const look: CSSProperties =
    variant === 'primary'
      ? { background: t.accent.control, color: t.text.onAccent, border: '1px solid transparent' }
      : variant === 'ghost'
        ? { background: 'transparent', color: t.text.secondary, border: '1px solid transparent' }
        : { background: t.fill.secondary, color: t.text.primary, border: `1px solid ${t.stroke.tertiary}` };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      style={mergeStyle(
        { ...look, height: 24, padding: '0 10px', borderRadius: 6, font: 'inherit', fontSize: 12, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, alignSelf: 'flex-start', whiteSpace: 'nowrap' },
        style,
      )}
    >
      {children}
    </button>
  );
}

export function Stat({ value, label, tone, style }: { value: ReactNode; label: string; tone?: 'success' | 'danger' | 'warning' | 'info'; style?: CSSProperties }) {
  const t = useHostTheme();
  return (
    <div style={mergeStyle({ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }, style)}>
      <div style={{ fontSize: 24, lineHeight: '30px', fontWeight: 590, color: toneColor(t, tone) ?? t.text.primary, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 12, lineHeight: '16px', color: t.text.secondary }}>{label}</div>
    </div>
  );
}

function ToneIcon({ tone, color }: { tone: Tone; color: string }) {
  const common = { width: 14, height: 14, viewBox: '0 0 16 16', fill: 'none', stroke: color, strokeWidth: 1.4, strokeLinecap: 'round' as const, 'aria-hidden': true };
  if (tone === 'warning')
    return (
      <svg {...common}>
        <path d="M8 2.2 14.3 13.5H1.7z" strokeLinejoin="round" />
        <path d="M8 6.5v3.2M8 11.6v.1" />
      </svg>
    );
  if (tone === 'success')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" />
        <path d="m5.4 8.2 1.8 1.8 3.5-3.7" strokeLinejoin="round" />
      </svg>
    );
  if (tone === 'danger')
    return (
      <svg {...common}>
        <circle cx="8" cy="8" r="6.2" />
        <path d="M8 4.8v3.8M8 10.9v.1" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="8" cy="8" r="6.2" />
      <path d="M8 7.2v4M8 4.9v.1" />
    </svg>
  );
}

export function Callout({ children, tone = 'info', title, icon, style }: { children?: ReactNode; tone?: Tone; title?: ReactNode; icon?: ReactNode; style?: CSSProperties }) {
  const t = useHostTheme();
  const color = toneColor(t, tone) ?? t.text.secondary;
  return (
    <aside style={mergeStyle({ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 8, background: t.fill.quaternary, border: `1px solid ${t.stroke.tertiary}`, color: t.text.primary }, style)}>
      <span style={{ paddingTop: 3, flex: 'none' }}>{icon ?? (tone === 'neutral' ? null : <ToneIcon tone={tone} color={color} />)}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, fontSize: 13, lineHeight: '20px' }}>
        {title && <strong style={{ fontWeight: 590 }}>{title}</strong>}
        <InText.Provider value>
          <div>{withMarkdown(children)}</div>
        </InText.Provider>
      </div>
    </aside>
  );
}

export function Swatch({ color, style }: { color: Color; style?: CSSProperties }) {
  const t = useHostTheme();
  return <span aria-hidden style={mergeStyle({ display: 'inline-block', width: 24, height: 24, borderRadius: 6, background: t.category[color] ?? t.category.gray, flex: 'none' }, style)} />;
}
