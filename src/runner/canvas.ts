// 카드 canvas(`canvas.tsx`)를 웹뷰에서 실행할 JavaScript로 바꾼다 (TASK-3 CV-1, CV-2).

import { transform } from 'sucrase';

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
