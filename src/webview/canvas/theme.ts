// `useHostTheme()` 호환 토큰 (TASK-3 CV-4). VS Code 테마 변수를 실제 색값(hex)으로 풀어 만든다.
// canvas 코드는 `${theme.accent.primary}33`처럼 색값에 투명도를 붙이기도 하므로 var() 문자열을 넘기지 않는다.

export type Color = 'gray' | 'purple' | 'green' | 'yellow' | 'cyan' | 'pink' | 'blue' | 'orange' | 'red';
export type CategoryPalette = Readonly<Record<Color, string>>;

export const categoryPaletteDark: CategoryPalette = {
  gray: '#9a9aa2', purple: '#b39ce8', green: '#6cc28d', yellow: '#e3cf6a', cyan: '#5bc0c7',
  pink: '#e58fbf', blue: '#7aa7e8', orange: '#e9a35a', red: '#ef7b7b',
};
export const categoryPaletteLight: CategoryPalette = {
  gray: '#6b6b73', purple: '#6a55d6', green: '#2a7d4b', yellow: '#7d6a0b', cyan: '#1a7d86',
  pink: '#b0407e', blue: '#2f6dc5', orange: '#a55e0e', red: '#c23b3b',
};
export const colorPalette = categoryPaletteDark;
export const usageColorSequence: readonly Color[] = ['blue', 'purple', 'green', 'orange', 'cyan', 'pink', 'yellow', 'red', 'gray'];

export const chartPalette = {
  green: '#2f9e72', darkGreen: '#1f8a5f', lightGreen: '#5cbf98', mintGreen: '#86d1b5',
  blue: '#3b82c4', lightBlue: '#78b4dd', indigo: '#5f6fc4', lightIndigo: '#9eaadd',
  purple: '#7f68bc', lightPurple: '#ad9bd9', warmPink: '#c95c9b', lightPink: '#e6a3c5',
  brightOrange: '#ee9f43', deepOrange: '#c2652e', goldenYellow: '#e2bd38', darkAmber: '#c24e4e',
  warmPeach: '#eea28a', vibrantTeal: '#2c9c8d', muted: '#8b8ba6', neutralLine: '#8c8c9c',
} as const;
export type ChartPalette = { readonly [K in keyof typeof chartPalette]: string };
export const chartColorSequence: readonly string[] = [
  chartPalette.blue, chartPalette.brightOrange, chartPalette.green, chartPalette.purple,
  chartPalette.lightBlue, chartPalette.warmPink, chartPalette.vibrantTeal, chartPalette.goldenYellow,
];

export const canvasSpacing = { '0.5': 2, '1': 4, '1.5': 6, '2': 8, '2.5': 10, '3': 12, '3.5': 14, '4': 16, '4.5': 18, '5': 20, '6': 24, '7': 28, '8': 32, '9': 36, '10': 40 } as const;
export const canvasRadius = { none: 0, xs: 2, sm: 4, md: 6, lg: 8, xl: 12, full: 9999 } as const;
export const canvasTypography = {
  fontFamily: 'inherit',
  h1: { fontSize: '24px', lineHeight: '30px', fontWeight: 590 },
  h2: { fontSize: '18px', lineHeight: '24px', fontWeight: 590 },
  h3: { fontSize: '16px', lineHeight: '22px', fontWeight: 590 },
  body: { fontSize: '14px', lineHeight: '20px', fontWeight: 400 },
  small: { fontSize: '12px', lineHeight: '16px', fontWeight: 400 },
} as const;

export interface CanvasTokens {
  bg: { editor: string; chrome: string; elevated: string };
  text: { primary: string; secondary: string; tertiary: string; quaternary: string; link: string; onAccent: string };
  stroke: { primary: string; secondary: string; tertiary: string; focused: string };
  fill: { primary: string; secondary: string; tertiary: string; quaternary: string };
  accent: { primary: string; control: string; controlHover: string };
  diff: { insertedLine: string; removedLine: string; stripAdded: string; stripRemoved: string };
  category: CategoryPalette;
}

export interface CanvasPalette {
  foreground: string; foregroundSecondary: string; foregroundTertiary: string; foregroundQuaternary: string;
  editor: string; chrome: string; sidebar: string; elevated: string;
  fillPrimary: string; fillSecondary: string; fillTertiary: string; fillQuaternary: string;
  strokePrimary: string; strokeSecondary: string; strokeTertiary: string; strokeFocused: string;
  accent: string; buttonBackground: string; buttonForeground: string; buttonHoverBackground: string; link: string;
  diffInsertedLine: string; diffRemovedLine: string; diffStripAdded: string; diffStripRemoved: string;
}

export interface CanvasHostTheme extends CanvasTokens {
  kind: string;
  brand: 'cursor';
  tokens: CanvasTokens;
  palette: CanvasPalette;
  radius: typeof canvasRadius;
  typography: typeof canvasTypography;
  chart: { palette: ChartPalette; sequence: readonly string[] };
}

// ---- 색 계산 ----

type Rgba = [number, number, number, number];

export function parseColor(value: string): Rgba | undefined {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(v)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? [...hex].map((c) => c + c).join('') : hex;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1];
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(v)?.[1];
  if (rgb) {
    const p = rgb.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.slice(0, 3).every(Number.isFinite)) return [p[0]!, p[1]!, p[2]!, Number.isFinite(p[3]) ? p[3]! : 1];
  }
  return undefined;
}

function toHex([r, g, b]: Rgba): string {
  return `#${[r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('')}`;
}

/** a를 비율 t만큼 b 위에 섞은 불투명 색 */
export function mix(a: string, b: string, t: number): string {
  const x = parseColor(a) ?? [204, 204, 204, 1];
  const y = parseColor(b) ?? [30, 30, 30, 1];
  return toHex([0, 1, 2].map((i) => x[i]! * t + y[i]! * (1 - t)) as unknown as Rgba);
}

/** 반투명 색을 배경 위에 합쳐 불투명 hex로 만든다. */
function solid(value: string, background: string): string {
  const c = parseColor(value);
  if (!c) return value;
  return c[3] >= 1 ? toHex(c) : mix(toHex(c), background, c[3]);
}

function cssVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
  return style.getPropertyValue(name).trim() || fallback;
}

export function themeKind(body: HTMLElement = document.body): string {
  const c = body.classList;
  if (c.contains('vscode-high-contrast-light')) return 'hc-light';
  if (c.contains('vscode-high-contrast')) return 'hc-dark';
  if (c.contains('vscode-light')) return 'light';
  return 'dark';
}

export function readHostTheme(body: HTMLElement = document.body): CanvasHostTheme {
  const kind = themeKind(body);
  const light = kind === 'light' || kind === 'hc-light';
  const s = getComputedStyle(body);
  const bg = solid(cssVar(s, '--vscode-editor-background', light ? '#ffffff' : '#1e1e1e'), light ? '#ffffff' : '#1e1e1e');
  const v = (name: string, fallback: string) => solid(cssVar(s, name, fallback), bg);
  const fg = v('--vscode-foreground', light ? '#3b3b3b' : '#cccccc');
  const accent = v('--vscode-textLink-foreground', light ? '#005fb8' : '#4daafc');
  const tokens: CanvasTokens = {
    bg: {
      editor: bg,
      chrome: v('--vscode-sideBar-background', mix(fg, bg, 0.03)),
      elevated: v('--vscode-editorWidget-background', mix(fg, bg, 0.05)),
    },
    text: {
      primary: fg,
      secondary: v('--vscode-descriptionForeground', mix(fg, bg, 0.75)),
      tertiary: mix(fg, bg, 0.55),
      quaternary: mix(fg, bg, 0.38),
      link: accent,
      onAccent: v('--vscode-button-foreground', '#ffffff'),
    },
    stroke: {
      primary: mix(fg, bg, 0.28),
      secondary: mix(fg, bg, 0.18),
      tertiary: mix(fg, bg, 0.11),
      focused: v('--vscode-focusBorder', accent),
    },
    fill: {
      primary: mix(fg, bg, 0.16),
      secondary: mix(fg, bg, 0.1),
      tertiary: mix(fg, bg, 0.065),
      quaternary: mix(fg, bg, 0.035),
    },
    accent: {
      primary: accent,
      control: v('--vscode-button-background', accent),
      controlHover: v('--vscode-button-hoverBackground', accent),
    },
    diff: {
      insertedLine: mix(light ? '#2a7d4b' : '#3fb950', bg, 0.16),
      removedLine: mix(light ? '#c23b3b' : '#f85149', bg, 0.16),
      stripAdded: light ? '#2a7d4b' : '#3fb950',
      stripRemoved: light ? '#c23b3b' : '#f85149',
    },
    category: light ? categoryPaletteLight : categoryPaletteDark,
  };
  const palette: CanvasPalette = {
    foreground: tokens.text.primary, foregroundSecondary: tokens.text.secondary,
    foregroundTertiary: tokens.text.tertiary, foregroundQuaternary: tokens.text.quaternary,
    editor: tokens.bg.editor, chrome: tokens.bg.chrome, sidebar: tokens.bg.chrome, elevated: tokens.bg.elevated,
    fillPrimary: tokens.fill.primary, fillSecondary: tokens.fill.secondary, fillTertiary: tokens.fill.tertiary, fillQuaternary: tokens.fill.quaternary,
    strokePrimary: tokens.stroke.primary, strokeSecondary: tokens.stroke.secondary, strokeTertiary: tokens.stroke.tertiary, strokeFocused: tokens.stroke.focused,
    accent: tokens.accent.primary, buttonBackground: tokens.accent.control, buttonForeground: tokens.text.onAccent,
    buttonHoverBackground: tokens.accent.controlHover, link: tokens.text.link,
    diffInsertedLine: tokens.diff.insertedLine, diffRemovedLine: tokens.diff.removedLine,
    diffStripAdded: tokens.diff.stripAdded, diffStripRemoved: tokens.diff.stripRemoved,
  };
  return {
    ...tokens,
    kind,
    brand: 'cursor',
    tokens,
    palette,
    radius: canvasRadius,
    typography: canvasTypography,
    chart: { palette: chartPalette, sequence: chartColorSequence },
  };
}
