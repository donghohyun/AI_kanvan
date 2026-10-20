// `cursor/canvas` 호환 차트 (TASK-3 CV-3). 외부 라이브러리 없이 SVG로 그린다.

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { useHostTheme } from './host';
import { mergeStyle } from './ui';

export type ChartTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
export type ChartDataPoint = { label: string; value: number };
export type ChartSeries = { name: string; data: number[]; tone?: ChartTone };
export type ChartReferenceLine = { value: number; label?: string; tone?: ChartTone };
type ValueAxisProps = { beginAtZero?: boolean; yMin?: number; yMax?: number; referenceLines?: ChartReferenceLine[] };

type Theme = ReturnType<typeof useHostTheme>;

function toneColor(t: Theme, tone: ChartTone | undefined, index: number): string {
  switch (tone) {
    case 'success':
      return t.chart.palette.green;
    case 'danger':
      return t.chart.palette.darkAmber;
    case 'warning':
      return t.chart.palette.brightOrange;
    case 'info':
      return t.chart.palette.blue;
    case 'neutral':
      return t.chart.palette.muted;
    default:
      return t.chart.sequence[index % t.chart.sequence.length]!;
  }
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) max = min + 1;
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

function fmt(v: number, prefix = '', suffix = ''): string {
  const abs = Math.abs(v);
  const s = abs >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : abs >= 1e4 ? `${(v / 1e3).toFixed(1)}k` : Number.isInteger(v) ? String(v) : v.toFixed(1);
  return `${prefix}${s}${suffix}`;
}

function Legend({ series, t }: { series: { name: string; color: string }[]; t: Theme }) {
  if (series.length < 2) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 12, color: t.text.secondary }}>
      {series.map((s) => (
        <span key={s.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
          {s.name}
        </span>
      ))}
    </div>
  );
}

const M = { top: 12, right: 16, bottom: 28, left: 44 };

/** 실제 화면 폭으로 그린다. viewBox로 늘리면 글자까지 커진다. */
function useWidth(): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(Math.max(240, el.clientWidth || 640));
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** 라벨 폭 추정 (한글 등 넓은 글자는 두 배) */
function textWidth(text: string, size = 11): number {
  return [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.6), 0);
}

export function BarChart({
  categories,
  series,
  height = 240,
  stacked,
  horizontal,
  normalized,
  valueSuffix = '',
  valuePrefix = '',
  showValues,
  beginAtZero = true,
  yMin,
  yMax,
  referenceLines = [],
  style,
}: ValueAxisProps & {
  categories: string[];
  series: ChartSeries[];
  height?: number;
  stacked?: boolean;
  horizontal?: boolean;
  normalized?: boolean;
  valueSuffix?: string;
  valuePrefix?: string;
  showValues?: boolean;
  style?: CSSProperties;
}) {
  const t = useHostTheme();
  const [ref, W] = useWidth();
  const stack = stacked || normalized;
  const colors = series.map((s, i) => ({ name: s.name, color: toneColor(t, s.tone, i) }));
  const totals = categories.map((_, c) => series.reduce((sum, s) => sum + Math.max(0, s.data[c] ?? 0), 0));
  const value = (s: number, c: number) => {
    const v = series[s]!.data[c] ?? 0;
    return normalized ? (totals[c] ? (v / totals[c]!) * 100 : 0) : v;
  };
  const values = stack ? categories.map((_, c) => (normalized ? 100 : totals[c]!)) : series.flatMap((s) => s.data);
  const lo = yMin ?? (beginAtZero || stack ? 0 : Math.min(...values));
  const hi = yMax ?? Math.max(...values, ...referenceLines.map((r) => r.value), lo + 1);
  const ticks = niceTicks(lo, hi);
  const top = ticks.at(-1)!;
  const bottom = ticks[0]!;
  const labels = showValues ?? (series.length === 1 && categories.length <= 8);
  // 가로 막대는 왼쪽에 카테고리 이름이 들어가므로 가장 긴 이름만큼 비운다.
  const left = horizontal ? Math.min(W * 0.4, Math.max(M.left, ...categories.map((c) => textWidth(c) + 12))) : M.left;
  const plotW = W - left - M.right;
  const plotH = height - M.top - M.bottom;
  const valuePos = (v: number) => (horizontal ? left + ((v - bottom) / (top - bottom)) * plotW : M.top + plotH - ((v - bottom) / (top - bottom)) * plotH);
  const band = (horizontal ? plotH : plotW) / Math.max(1, categories.length);
  const barGap = band * 0.2;
  const groupW = band - barGap;
  const suffix = normalized ? '%' : valueSuffix;
  const prefix = normalized ? '' : valuePrefix;

  return (
    <div ref={ref} style={mergeStyle({ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }, style)}>
      <svg width={W} height={height} role="img" style={{ display: 'block', overflow: 'visible' }}>
        {ticks.map((v) => (
          <g key={v}>
            {horizontal ? (
              <line x1={valuePos(v)} x2={valuePos(v)} y1={M.top} y2={M.top + plotH} stroke={t.stroke.tertiary} />
            ) : (
              <line x1={left} x2={left + plotW} y1={valuePos(v)} y2={valuePos(v)} stroke={t.stroke.tertiary} />
            )}
            <text
              x={horizontal ? valuePos(v) : left - 6}
              y={horizontal ? height - 8 : valuePos(v) + 4}
              textAnchor={horizontal ? 'middle' : 'end'}
              fontSize="11"
              fill={t.text.tertiary}
            >
              {fmt(v, prefix, suffix)}
            </text>
          </g>
        ))}
        {categories.map((cat, c) => {
          const start = (horizontal ? M.top : left) + c * band + barGap / 2;
          let acc = 0;
          return (
            <g key={cat}>
              {series.map((s, i) => {
                const v = value(i, c);
                const from = stack ? acc : bottom;
                const to = stack ? acc + v : v;
                if (stack) acc += v;
                const w = stack ? groupW : groupW / series.length;
                const offset = stack ? 0 : i * w;
                const a = valuePos(Math.min(from, to));
                const b = valuePos(Math.max(from, to));
                const rect = horizontal
                  ? { x: a, y: start + offset, width: Math.max(0, b - a), height: w - 2 }
                  : { x: start + offset, y: b, width: w - 2, height: Math.max(0, a - b) };
                return (
                  <g key={s.name}>
                    <rect {...rect} rx="2" fill={colors[i]!.color}>
                      <title>{`${cat} · ${s.name}: ${fmt(series[i]!.data[c] ?? 0, valuePrefix, valueSuffix)}`}</title>
                    </rect>
                    {labels && !stack && (
                      <text
                        x={horizontal ? rect.x + rect.width + 4 : rect.x + rect.width / 2}
                        y={horizontal ? rect.y + rect.height / 2 + 4 : rect.y - 4}
                        textAnchor={horizontal ? 'start' : 'middle'}
                        fontSize="11"
                        fill={t.text.secondary}
                      >
                        {fmt(v, prefix, suffix)}
                      </text>
                    )}
                  </g>
                );
              })}
              <text
                x={horizontal ? left - 6 : start + groupW / 2}
                y={horizontal ? start + groupW / 2 + 4 : height - 8}
                textAnchor={horizontal ? 'end' : 'middle'}
                fontSize="11"
                fill={t.text.secondary}
              >
                {cat}
              </text>
            </g>
          );
        })}
        {referenceLines.map((r, i) => (
          <g key={i}>
            {horizontal ? (
              <line x1={valuePos(r.value)} x2={valuePos(r.value)} y1={M.top} y2={M.top + plotH} stroke={toneColor(t, r.tone ?? 'neutral', 0)} strokeDasharray="4 3" />
            ) : (
              <line x1={left} x2={left + plotW} y1={valuePos(r.value)} y2={valuePos(r.value)} stroke={toneColor(t, r.tone ?? 'neutral', 0)} strokeDasharray="4 3" />
            )}
            {r.label && (
              <text x={horizontal ? valuePos(r.value) + 4 : left + plotW} y={horizontal ? M.top + 10 : valuePos(r.value) - 4} textAnchor={horizontal ? 'start' : 'end'} fontSize="11" fill={t.text.secondary}>
                {r.label}
              </text>
            )}
          </g>
        ))}
      </svg>
      <Legend series={colors} t={t} />
    </div>
  );
}

export function LineChart({
  categories,
  series,
  height = 240,
  fill,
  valueSuffix = '',
  valuePrefix = '',
  showValues,
  showHoverGuide = true,
  beginAtZero = true,
  yMin,
  yMax,
  referenceLines = [],
  style,
}: ValueAxisProps & {
  categories: string[];
  series: ChartSeries[];
  height?: number;
  fill?: boolean;
  valueSuffix?: string;
  valuePrefix?: string;
  showValues?: boolean;
  showHoverGuide?: boolean;
  style?: CSSProperties;
}) {
  const t = useHostTheme();
  const [ref, W] = useWidth();
  const [hover, setHover] = useState<number>();
  const colors = series.map((s, i) => ({ name: s.name, color: toneColor(t, s.tone, i) }));
  const all = series.flatMap((s) => s.data);
  const lo = yMin ?? (beginAtZero ? Math.min(0, ...all) : Math.min(...all));
  const hi = yMax ?? Math.max(...all, ...referenceLines.map((r) => r.value), lo + 1);
  const ticks = niceTicks(lo, hi);
  const bottom = ticks[0]!;
  const top = ticks.at(-1)!;
  const plotW = W - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const x = (i: number) => M.left + (categories.length <= 1 ? plotW / 2 : (i / (categories.length - 1)) * plotW);
  const y = (v: number) => M.top + plotH - ((v - bottom) / (top - bottom)) * plotH;
  const step = Math.max(1, Math.ceil(categories.length / 8));
  return (
    <div ref={ref} style={mergeStyle({ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }, style)}>
      <svg
        width={W}
        height={height}
        role="img"
        style={{ display: 'block', overflow: 'visible' }}
        onMouseMove={(e) => {
          if (!showHoverGuide) return;
          const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
          setHover(Math.max(0, Math.min(categories.length - 1, Math.round(((px - M.left) / plotW) * (categories.length - 1)))));
        }}
        onMouseLeave={() => setHover(undefined)}
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={M.left + plotW} y1={y(v)} y2={y(v)} stroke={t.stroke.tertiary} />
            <text x={M.left - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill={t.text.tertiary}>
              {fmt(v, valuePrefix, valueSuffix)}
            </text>
          </g>
        ))}
        {categories.map((c, i) =>
          i % step === 0 ? (
            <text key={c + i} x={x(i)} y={height - 8} textAnchor="middle" fontSize="11" fill={t.text.secondary}>
              {c}
            </text>
          ) : null,
        )}
        {series.map((s, si) => {
          const pts = s.data.map((v, i) => `${x(i)},${y(v)}`).join(' ');
          return (
            <g key={s.name}>
              {fill && <polygon points={`${x(0)},${y(bottom)} ${pts} ${x(s.data.length - 1)},${y(bottom)}`} fill={colors[si]!.color} opacity={0.15} />}
              <polyline points={pts} fill="none" stroke={colors[si]!.color} strokeWidth="2" strokeLinejoin="round" />
              {s.data.map((v, i) => (
                <g key={i}>
                  <circle cx={x(i)} cy={y(v)} r={hover === i ? 4 : 2.5} fill={colors[si]!.color}>
                    <title>{`${categories[i]} · ${s.name}: ${fmt(v, valuePrefix, valueSuffix)}`}</title>
                  </circle>
                  {showValues && categories.length <= 20 && (
                    <text x={x(i)} y={y(v) - 6} textAnchor="middle" fontSize="10" fill={t.text.secondary}>
                      {fmt(v, valuePrefix, valueSuffix)}
                    </text>
                  )}
                </g>
              ))}
            </g>
          );
        })}
        {referenceLines.map((r, i) => (
          <g key={i}>
            <line x1={M.left} x2={M.left + plotW} y1={y(r.value)} y2={y(r.value)} stroke={toneColor(t, r.tone ?? 'neutral', 0)} strokeDasharray="4 3" />
            {r.label && (
              <text x={M.left + plotW} y={y(r.value) - 4} textAnchor="end" fontSize="11" fill={t.text.secondary}>
                {r.label}
              </text>
            )}
          </g>
        ))}
        {hover !== undefined && <line x1={x(hover)} x2={x(hover)} y1={M.top} y2={M.top + plotH} stroke={t.stroke.secondary} />}
      </svg>
      {hover !== undefined && (
        <div style={{ fontSize: 12, color: t.text.secondary }}>
          {categories[hover]}: {series.map((s) => `${s.name} ${fmt(s.data[hover] ?? 0, valuePrefix, valueSuffix)}`).join(' · ')}
        </div>
      )}
      <Legend series={colors} t={t} />
    </div>
  );
}

export function PieChart({ data, size = 200, donut, style }: { data: Array<ChartDataPoint & { tone?: ChartTone }>; size?: number; donut?: boolean; style?: CSSProperties }) {
  const t = useHostTheme();
  const [hover, setHover] = useState<number>();
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
  const r = size / 2;
  const inner = donut ? r * 0.6 : 0;
  let angle = -Math.PI / 2;
  const arcs = data.map((d, i) => {
    const sweep = (Math.max(0, d.value) / total) * Math.PI * 2;
    const start = angle;
    angle += sweep;
    return { d, i, start, end: angle, color: toneColor(t, d.tone, i) };
  });
  const point = (rad: number, a: number) => `${r + rad * Math.cos(a)},${r + rad * Math.sin(a)}`;
  const path = (start: number, end: number, grow: number) => {
    const outer = r - 2 + grow;
    const large = end - start > Math.PI ? 1 : 0;
    if (end - start >= Math.PI * 2 - 1e-6) end = start + Math.PI * 2 - 1e-4;
    return inner
      ? `M${point(outer, start)} A${outer},${outer} 0 ${large} 1 ${point(outer, end)} L${point(inner, end)} A${inner},${inner} 0 ${large} 0 ${point(inner, start)} Z`
      : `M${r},${r} L${point(outer, start)} A${outer},${outer} 0 ${large} 1 ${point(outer, end)} Z`;
  };
  return (
    <div style={mergeStyle({ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }, style)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" style={{ overflow: 'visible' }}>
        {arcs.map((a) => (
          <path key={a.i} d={path(a.start, a.end, hover === a.i ? 2 : 0)} fill={a.color} stroke={t.bg.editor} strokeWidth="1" onMouseEnter={() => setHover(a.i)} onMouseLeave={() => setHover(undefined)}>
            <title>{`${a.d.label}: ${a.d.value} (${Math.round((a.d.value / total) * 100)}%)`}</title>
          </path>
        ))}
        {donut && (
          <text x={r} y={r + 6} textAnchor="middle" fontSize="18" fontWeight="600" fill={t.text.primary}>
            {fmt(total)}
          </text>
        )}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: t.text.secondary }}>
        {arcs.map((a) => (
          <span key={a.i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: hover === a.i ? 600 : 400 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: a.color }} />
            {a.d.label} · {a.d.value}
          </span>
        ))}
      </div>
    </div>
  );
}
