import { createContext, useContext } from 'react';
import { translate, type Locale, type MessageKey } from '../shared/i18n';
import type { ToExtension, ToWebview } from '../shared/protocol';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void; getState(): unknown; setState(state: unknown): void };

const api = acquireVsCodeApi();

export function send(msg: ToExtension): void {
  api.postMessage(msg);
}

/** 보는 사람의 화면 상태 (필터 등). 공유 파일에는 쓰지 않는다 (TASK-2 DS-5). */
export function loadViewState<T>(fallback: T): T {
  return { ...fallback, ...((api.getState() as Partial<T> | undefined) ?? {}) };
}

export function saveViewState(state: unknown): void {
  api.setState(state);
}

export function onMessage(handler: (msg: ToWebview) => void): () => void {
  const listener = (e: MessageEvent<ToWebview>) => handler(e.data);
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

export const LocaleContext = createContext<Locale>('en');

export function useT(): (key: MessageKey, params?: Record<string, string | number>) => string {
  const locale = useContext(LocaleContext);
  return (key, params) => translate(locale, key, params);
}
