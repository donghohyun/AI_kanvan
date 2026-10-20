// canvas와 보드를 잇는 문맥: 테마, 상태 저장, IDE 동작 (TASK-3 CV-4 ~ CV-7).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { CanvasHostTheme } from './theme';

export type CanvasAction =
  | { type: 'openFile'; path: string; selection?: { startLineNumber?: number; startColumn?: number; endLineNumber?: number; endColumn?: number } }
  | { type: 'openAgent'; agentId: string }
  | { type: 'newComposerChat'; userPrompt?: string };

export interface CanvasHost {
  theme: CanvasHostTheme;
  state: Record<string, unknown>;
  setState(key: string, value: unknown): void;
  dispatch(action: CanvasAction): void;
  openLink(href: string): void;
}

export const CanvasHostContext = createContext<CanvasHost | null>(null);

export function useHost(): CanvasHost {
  const host = useContext(CanvasHostContext);
  if (!host) throw new Error('cursor/canvas components must be rendered inside a canvas');
  return host;
}

export function useHostTheme(): CanvasHostTheme {
  return useHost().theme;
}

export type SetCanvasState<T> = (action: T | ((prev: T) => T)) => void;

/** 값은 카드별로 이 기기에 저장된다 (CV-5). */
export function useCanvasState<T>(key: string, defaultValue: T): [T, SetCanvasState<T>] {
  const host = useHost();
  const [value, setValue] = useState<T>(() => (key in host.state ? (host.state[key] as T) : defaultValue));
  const latest = useRef(value);
  latest.current = value;
  const set = useCallback<SetCanvasState<T>>(
    (action) => {
      const next = typeof action === 'function' ? (action as (prev: T) => T)(latest.current) : action;
      latest.current = next;
      setValue(next);
      host.setState(key, next);
    },
    [host, key],
  );
  return [value, set];
}

export function useCanvasAction(): (action: CanvasAction) => void {
  const host = useHost();
  return useCallback((action: CanvasAction) => host.dispatch(action), [host]);
}

/** body 클래스·스타일이 바뀌면(테마 변경) 다시 읽는다. */
export function useLiveTheme(read: () => CanvasHostTheme): CanvasHostTheme {
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()));
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, [read]);
  return theme;
}
