// 카드 canvas(`canvas.tsx`)를 웹뷰에서 실행할 JavaScript로 바꾼다 (TASK-3 CV-1, CV-2).

import { transform } from 'sucrase';
import { parse } from 'sucrase/dist/parser';
import { TokenType } from 'sucrase/dist/parser/tokenizer/types';
import type { CanvasLiteral } from '../shared/protocol';

/** canvas가 가져올 수 있는 모듈. Cursor canvas 규칙과 같다. */
export const CANVAS_MODULES = ['cursor/canvas', 'react', 'react/jsx-runtime'] as const;

export const CANVAS_FILE = 'canvas.tsx';

export type CanvasCompileResult = { code: string } | { error: string; line?: number };

export function compileCanvas(source: string): CanvasCompileResult {
  let code: string;
  try {
    code = transform(source, {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxRuntime: 'automatic',
      production: true,
      filePath: CANVAS_FILE,
    }).code;
  } catch (err) {
    const e = err as Error & { loc?: { line: number; column: number } };
    return { error: e.message, line: e.loc?.line };
  }
  const imports = [...code.matchAll(/require\((["'])([^"']+)\1\)/g)].map((m) => m[2]!);
  const unknown = imports.filter((name) => !(CANVAS_MODULES as readonly string[]).includes(name));
  if (unknown.length) return { error: `Only ${CANVAS_MODULES.slice(0, 2).join(' and ')} can be imported (found: ${[...new Set(unknown)].join(', ')})` };
  return { code };
}

/** 페이지 전체를 그리는 canvas(default export)인지, md 문서에 끼워 넣는 그림 모음인지 */
export function canvasMode(source: string): 'page' | 'figures' {
  return /\bexport\s+default\b/.test(source) ? 'page' : 'figures';
}

/** 그림 컴포넌트 이름 → 정의한 줄(1부터). 문서에서 그림을 누르면 이 줄로 간다. */
export function figureLines(source: string): Record<string, number> {
  const out: Record<string, number> = {};
  const re = /^[ \t]*export\s+(?:function\s+([A-Za-z_$][\w$]*)|const\s+([A-Za-z_$][\w$]*)\s*=)/gm;
  for (const m of source.matchAll(re)) out[(m[1] ?? m[2])!] = lineAt(source, m.index!);
  return out;
}

export function canvasLiterals(source: string): CanvasLiteral[] {
  let tokens;
  try {
    tokens = parse(source, true, true, false).tokens;
  } catch {
    return [];
  }
  const out: CanvasLiteral[] = [];
  // 글자를 감싼 가장 안쪽 괄호. 같은 괄호 안 글자(표의 한 행 등)는 화면에서도 함께 보인다.
  const open: number[] = [];
  tokens.forEach((t, i) => {
    if (OPENERS.has(t.type)) open.push(i);
    else if (CLOSERS.has(t.type)) open.pop();
    if (t.isType) return;
    const raw = source.slice(t.start, t.end);
    const group = open.at(-1) ?? -1;
    if (t.type === TokenType.jsxText) {
      if (!raw.trim()) return;
      out.push({ start: t.start, end: t.end, line: lineAt(source, t.start), value: jsxTextValue(raw), kind: 'jsxText', group });
      return;
    }
    if (t.type !== TokenType.string) return;
    // import 경로는 화면에 나오지 않는다.
    if (/\b(from|import)\s*$/.test(source.slice(Math.max(0, t.start - 12), t.start))) return;
    const attr = tokens[i - 1]?.type === TokenType.eq && tokens[i - 2]?.type === TokenType.jsxName;
    out.push({
      start: t.start,
      end: t.end,
      line: lineAt(source, t.start),
      value: attr ? raw.slice(1, -1) : decodeString(raw),
      kind: attr ? 'jsxAttr' : 'string',
      group,
    });
  });
  return out;
}

const OPENERS = new Set([TokenType.parenL, TokenType.bracketL, TokenType.braceL, TokenType.braceBarL, TokenType.dollarBraceL]);
const CLOSERS = new Set([TokenType.parenR, TokenType.bracketR, TokenType.braceR, TokenType.braceBarR]);

/** JSX 글자는 줄바꿈과 앞뒤 공백을 접어서 보여 준다. */
function jsxTextValue(raw: string): string {
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
}

function decodeString(raw: string): string {
  return raw.slice(1, -1).replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|.)/g, (_, e: string) => {
    if (e.startsWith('u{')) return String.fromCodePoint(parseInt(e.slice(2, -1), 16));
    if (e[0] === 'u' || e[0] === 'x') return String.fromCharCode(parseInt(e.slice(1), 16));
    return ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', '0': '\0' } as Record<string, string>)[e] ?? (e.startsWith('\r') || e.startsWith('\n') ? '' : e);
  });
}

/** 글자를 바꾼 뒤 원문에 넣을 코드. 원래 따옴표와 앞뒤 공백을 유지한다. */
export function encodeLiteral(literal: CanvasLiteral, raw: string, value: string): string {
  if (literal.kind === 'jsxText') {
    const lead = /^\s*/.exec(raw)![0];
    const trail = /\s*$/.exec(raw)![0];
    const body = /[{}<>]/.test(value) || value !== value.trim() || value.includes('\n') ? `{${JSON.stringify(value)}}` : value;
    return lead + body + trail;
  }
  const quote = raw[0] === "'" ? "'" : '"';
  if (literal.kind === 'jsxAttr') {
    // JSX 속성 문자열에는 이스케이프가 없다.
    return value.includes(quote) || /[\\\n]/.test(value) ? `{${JSON.stringify(value)}}` : quote + value + quote;
  }
  const escaped = value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  return quote + escaped.split(quote).join(`\\${quote}`) + quote;
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i += 1) if (source.charCodeAt(i) === 10) line += 1;
  return line;
}
