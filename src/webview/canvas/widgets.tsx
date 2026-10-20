// `cursor/canvas` 호환: 할 일, 사용량 막대, diff, 폼 컴포넌트 (TASK-3 CV-3).

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useHostTheme } from './host';
import { usageColorSequence, type Color } from './theme';
import { CanvasChevron, mergeStyle } from './ui';

// ---- 할 일 ----

export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export interface TodoItem {
  readonly id: string;
  readonly content: string;
  readonly status: TodoStatus;
}

function TodoIcon({ status }: { status: TodoStatus }) {
  const t = useHostTheme();
  const color = status === 'completed' ? t.category.green : status === 'in_progress' ? t.accent.primary : t.text.tertiary;
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-label={status} style={{ flex: 'none', marginTop: 3 }}>
      <circle cx="8" cy="8" r="6" fill="none" stroke={color} strokeWidth="1.4" strokeDasharray={status === 'cancelled' ? '2 2' : undefined} />
      {status === 'completed' && <path d="m5.3 8.2 1.8 1.8 3.6-3.8" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      {status === 'in_progress' && <path d="M8 2a6 6 0 0 1 0 12z" fill={color} />}
    </svg>
  );
}

export function TodoList({
  todos,
  dimmedTodoIds,
  onTodoClick,
  style,
}: {
  todos: readonly TodoItem[];
  dimmedTodoIds?: ReadonlySet<string>;
  onTodoClick?: (todo: TodoItem) => void;
  style?: CSSProperties;
}) {
  const t = useHostTheme();
  if (todos.length === 0) return null;
  return (
    <div style={mergeStyle({ display: 'flex', flexDirection: 'column' }, style)}>
      {todos.map((todo) => (
        <button
          key={todo.id}
          type="button"
          onClick={() => onTodoClick?.(todo)}
          style={{
            display: 'flex',
            gap: 8,
            padding: '4px 0',
            background: 'none',
            border: 'none',
            textAlign: 'left',
            font: 'inherit',
            fontSize: 13,
            lineHeight: '20px',
            cursor: onTodoClick ? 'pointer' : 'default',
            color: todo.status === 'completed' || todo.status === 'cancelled' ? t.text.tertiary : t.text.primary,
            textDecoration: todo.status === 'cancelled' ? 'line-through' : undefined,
            opacity: dimmedTodoIds?.has(todo.id) ? 0.5 : 1,
          }}
        >
          <TodoIcon status={todo.status} />
          <span style={{ minWidth: 0 }}>{todo.content}</span>
        </button>
      ))}
    </div>
  );
}

export function TodoListCard({
  todos,
  dimmedTodoIds,
  defaultExpanded = true,
  onTodoClick,
  style,
}: {
  todos: readonly TodoItem[];
  dimmedTodoIds?: ReadonlySet<string>;
  defaultExpanded?: boolean;
  onTodoClick?: (todo: TodoItem) => void;
  style?: CSSProperties;
}) {
  const t = useHostTheme();
  const [open, setOpen] = useState(defaultExpanded);
  if (todos.length === 0) return null;
  const done = todos.filter((x) => x.status === 'completed').length;
  return (
    <section style={mergeStyle({ border: `1px solid ${t.stroke.tertiary}`, borderRadius: 8, background: t.bg.elevated }, style)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 12px', background: 'none', border: 'none', color: t.text.secondary, font: 'inherit', fontSize: 12, cursor: 'pointer' }}
      >
        <CanvasChevron expanded={open} />
        {done} of {todos.length} Done
      </button>
      {open && <TodoList todos={todos} dimmedTodoIds={dimmedTodoIds} onTodoClick={onTodoClick} style={{ padding: '0 12px 8px' }} />}
    </section>
  );
}

// ---- 사용량 막대 ----

export interface UsageBarSegment {
  readonly id: string;
  readonly value: number;
  readonly color?: Color;
}

export function UsageBar({
  segments,
  total,
  topLeftLabel,
  topRightLabel,
  style,
}: {
  segments: readonly UsageBarSegment[];
  total: number;
  topLeftLabel?: ReactNode;
  topRightLabel?: ReactNode;
  style?: CSSProperties;
}) {
  const t = useHostTheme();
  const value = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const sum = segments.reduce((s, x) => s + value(x.value), 0);
  const scale = Math.max(total, sum) || 1;
  return (
    <div style={mergeStyle({ display: 'flex', flexDirection: 'column', gap: 6 }, style)}>
      {(topLeftLabel || topRightLabel) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: t.text.secondary }}>
          <span>{topLeftLabel}</span>
          <span>{topRightLabel}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: 2, height: 8 }}>
        {segments.map((s, i) => (
          <span
            key={s.id}
            style={{
              width: `${(value(s.value) / scale) * 100}%`,
              background: t.category[s.color ?? usageColorSequence[i % usageColorSequence.length]!],
              borderRadius: 999,
            }}
          />
        ))}
        <span style={{ flex: 1, background: t.fill.secondary, borderRadius: 999 }} />
      </div>
    </div>
  );
}

// ---- diff ----

export function DiffStats({ additions = 0, deletions = 0, style }: { additions?: number; deletions?: number; style?: CSSProperties }) {
  const t = useHostTheme();
  if (!additions && !deletions) return null;
  return (
    <span style={mergeStyle({ display: 'inline-flex', gap: 6, fontVariantNumeric: 'tabular-nums', fontSize: 12 }, style)}>
      {additions > 0 && <span style={{ color: t.diff.stripAdded }}>+{additions}</span>}
      {deletions > 0 && <span style={{ color: t.diff.stripRemoved }}>-{deletions}</span>}
    </span>
  );
}

export type DiffLineData = { type: 'added' | 'removed' | 'unchanged'; content: string; lineNumber?: number };

export function DiffView({
  lines,
  showLineNumbers = true,
  coloredLineNumbers = true,
  showAccentStrip = true,
  style,
}: {
  lines: DiffLineData[];
  path?: string;
  language?: string;
  showLineNumbers?: boolean;
  coloredLineNumbers?: boolean;
  showAccentStrip?: boolean;
  style?: CSSProperties;
}) {
  const t = useHostTheme();
  return (
    <div style={mergeStyle({ fontFamily: 'var(--vscode-editor-font-family, monospace)', fontSize: 12, lineHeight: '18px', overflowX: 'auto' }, style)}>
      {lines.map((line, i) => {
        const bg = line.type === 'added' ? t.diff.insertedLine : line.type === 'removed' ? t.diff.removedLine : undefined;
        const strip = line.type === 'added' ? t.diff.stripAdded : line.type === 'removed' ? t.diff.stripRemoved : 'transparent';
        return (
          <div key={i} style={{ display: 'flex', background: bg, borderLeft: showAccentStrip ? `3px solid ${strip}` : undefined }}>
            {showLineNumbers && (
              <span style={{ width: 44, flex: 'none', textAlign: 'right', paddingRight: 10, color: coloredLineNumbers && line.type !== 'unchanged' ? strip : t.text.quaternary, userSelect: 'none' }}>
                {line.lineNumber ?? ''}
              </span>
            )}
            <span style={{ whiteSpace: 'pre', color: t.text.primary }}>
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '} {line.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- 폼 ----

function useField() {
  const t = useHostTheme();
  return {
    font: 'inherit',
    fontSize: 13,
    color: t.text.primary,
    background: t.bg.editor,
    border: `1px solid ${t.stroke.secondary}`,
    borderRadius: 6,
    padding: '0 8px',
  } satisfies CSSProperties;
}

export function TextInput({
  value,
  onChange,
  placeholder,
  disabled,
  type = 'text',
  style,
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: 'text' | 'email' | 'password' | 'number' | 'url' | 'search';
  style?: CSSProperties;
}) {
  const field = useField();
  return <input type={type} value={value ?? ''} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} style={mergeStyle({ ...field, height: 28 }, style)} />;
}

export function TextArea({ value, onChange, placeholder, disabled, rows = 3, style }: { value?: string; onChange?: (value: string) => void; placeholder?: string; disabled?: boolean; rows?: number; style?: CSSProperties }) {
  const field = useField();
  return (
    <textarea
      value={value ?? ''}
      placeholder={placeholder}
      disabled={disabled}
      rows={Math.max(rows, (value ?? '').split('\n').length)}
      onChange={(e) => onChange?.(e.target.value)}
      style={mergeStyle({ ...field, padding: '6px 8px', resize: 'vertical' }, style)}
    />
  );
}

export function Checkbox({ checked, onChange, disabled, label, style }: { checked?: boolean; onChange?: (checked: boolean) => void; disabled?: boolean; label?: ReactNode; style?: CSSProperties }) {
  const t = useHostTheme();
  return (
    <label style={mergeStyle({ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: t.text.primary, cursor: disabled ? 'default' : 'pointer' }, style)}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} style={{ accentColor: t.accent.control }} />
      {label}
    </label>
  );
}

export function Toggle({ checked, onChange, disabled, size = 'sm', style }: { checked?: boolean; onChange?: (checked: boolean) => void; disabled?: boolean; size?: 'sm' | 'md'; style?: CSSProperties }) {
  const t = useHostTheme();
  const h = size === 'md' ? 20 : 16;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      style={mergeStyle(
        { width: h * 1.8, height: h, borderRadius: h, border: 'none', padding: 2, background: checked ? t.accent.control : t.fill.primary, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, display: 'inline-flex', justifyContent: checked ? 'flex-end' : 'flex-start' },
        style,
      )}
    >
      <span style={{ width: h - 4, height: h - 4, borderRadius: '50%', background: checked ? t.text.onAccent : t.text.secondary }} />
    </button>
  );
}

export type SelectOption = { value: string; label: string; disabled?: boolean };

export function Select({ value, onChange, options, placeholder, disabled, style }: { value?: string; onChange?: (value: string) => void; options: SelectOption[]; placeholder?: string; disabled?: boolean; style?: CSSProperties }) {
  const field = useField();
  return (
    <select value={value ?? ''} disabled={disabled} onChange={(e) => onChange?.(e.target.value)} style={mergeStyle({ ...field, height: 28 }, style)}>
      {placeholder !== undefined && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function IconButton({ children, onClick, disabled, title, variant = 'default', size = 'md', style }: { children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string; variant?: 'default' | 'circle'; size?: 'sm' | 'md'; style?: CSSProperties }) {
  const t = useHostTheme();
  const s = size === 'sm' ? 16 : 20;
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      style={mergeStyle(
        { width: s + 4, height: s + 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: variant === 'circle' ? '50%' : 4, border: 'none', background: variant === 'circle' ? t.fill.secondary : 'transparent', color: t.text.secondary, cursor: disabled ? 'default' : 'pointer', padding: 0, font: 'inherit' },
        style,
      )}
    >
      {children}
    </button>
  );
}
