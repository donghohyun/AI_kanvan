// canvas 코드 실행: `cursor/canvas` 호환 모듈을 넘겨 기본 export 컴포넌트를 꺼내고, 오류는 화면에만 가둔다 (TASK-3 CV-2, CV-8).

import * as React from 'react';
import { Component, useMemo, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import * as charts from './charts';
import { computeDAGLayout } from './dag';
import { CanvasHostContext, useCanvasAction, useCanvasState, useHostTheme, useLiveTheme, type CanvasHost } from './host';
import {
  categoryPaletteDark,
  categoryPaletteLight,
  chartColorSequence,
  chartPalette,
  canvasRadius,
  canvasSpacing,
  canvasTypography,
  colorPalette,
  readHostTheme,
  usageColorSequence,
} from './theme';
import * as ui from './ui';
import * as widgets from './widgets';

/** `import … from "cursor/canvas"`가 받는 모듈 (CV-3) */
function canvasModule(): Record<string, unknown> {
  const theme = readHostTheme();
  return {
    ...ui,
    ...widgets,
    ...charts,
    computeDAGLayout,
    useHostTheme,
    useCanvasState,
    useCanvasAction,
    useEffect: React.useEffect,
    useMemo: React.useMemo,
    useRef: React.useRef,
    useState: React.useState,
    useCallback: React.useCallback,
    canvasTokens: theme.tokens,
    canvasTokensLight: theme.tokens,
    canvasPaletteDark: theme.palette,
    canvasPaletteLight: theme.palette,
    canvasPaletteGrokDark: theme.palette,
    canvasPaletteGrokLight: theme.palette,
    categoryPaletteDark,
    categoryPaletteLight,
    colorPalette,
    usageColorSequence,
    chartPalette,
    chartColorSequence,
    canvasSpacing,
    canvasRadius,
    canvasTypography,
  };
}

/** 변환된 canvas 코드를 실행해 export를 돌려준다. */
export function loadCanvasModule(code: string): Record<string, unknown> {
  const module = { exports: {} as Record<string, unknown> };
  const require = (name: string): unknown => {
    if (name === 'cursor/canvas') return canvasModule();
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return jsxRuntime;
    throw new Error(`Cannot import "${name}" in a canvas. Only cursor/canvas and react are available.`);
  };
  // 확장 프로그램이 변환한 코드를 실행한다. 웹뷰는 파일·네트워크 접근이 막힌 격리 환경이다.
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  return module.exports;
}

export function loadCanvas(code: string): ComponentType {
  const component = loadCanvasModule(code).default;
  if (typeof component !== 'function') throw new Error('canvas.tsx must default-export a React component.');
  return component as ComponentType;
}

/** md 문서에 끼워 넣을 그림: 이름이 대문자로 시작하는 함수 export */
export function loadFigures(code: string): Record<string, ComponentType> {
  const out: Record<string, ComponentType> = {};
  for (const [name, value] of Object.entries(loadCanvasModule(code))) if (/^[A-Z]/.test(name) && typeof value === 'function') out[name] = value as ComponentType;
  return out;
}

export class Boundary extends Component<{ onError: (message: string) => void; fallback: (message: string) => ReactNode; children: ReactNode }, { error?: string }> {
  state: { error?: string } = {};
  static getDerivedStateFromError(error: Error) {
    return { error: error.message || String(error) };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    const where = info.componentStack?.split('\n').find((l) => l.trim())?.trim();
    this.props.onError(where ? `${error.message} (${where})` : error.message);
  }
  render() {
    return this.state.error !== undefined ? this.props.fallback(this.state.error) : this.props.children;
  }
}

export interface CanvasViewProps {
  code: string;
  state: Record<string, unknown>;
  host: Omit<CanvasHost, 'theme' | 'state'>;
  onError: (message: string) => void;
  fallback: (message: string) => ReactNode;
}

/** canvas 컴포넌트가 쓰는 테마·상태·동작 문맥과 문서 바탕. 기본 문서와 Markdown 문서도 이 안에서 그린다. */
export function CanvasFrame({ state, host, children }: { state: Record<string, unknown>; host: Omit<CanvasHost, 'theme' | 'state'>; children: ReactNode }) {
  const theme = useLiveTheme(readHostTheme);
  const value = useMemo<CanvasHost>(() => ({ ...host, theme, state }), [host, theme, state]);
  return (
    <CanvasHostContext.Provider value={value}>
      <div className="canvas-root" style={{ background: theme.bg.editor, color: theme.text.primary }}>
        {children}
      </div>
    </CanvasHostContext.Provider>
  );
}

/** 변환된 canvas를 그린다. 코드가 바뀌면 다시 불러온다. */
export function CanvasView({ code, state, host, onError, fallback }: CanvasViewProps) {
  const loaded = useMemo((): { component?: ComponentType; error?: string } => {
    try {
      return { component: loadCanvas(code) };
    } catch (err) {
      return { error: (err as Error).message };
    }
  }, [code]);
  React.useEffect(() => {
    if (loaded.error) onError(loaded.error);
  }, [loaded.error, onError]);

  if (loaded.error || !loaded.component) return <>{fallback(loaded.error ?? 'canvas did not load')}</>;
  const Canvas = loaded.component;
  return (
    <CanvasFrame state={state} host={host}>
      <Boundary key={code} onError={onError} fallback={fallback}>
        <Canvas />
      </Boundary>
    </CanvasFrame>
  );
}
