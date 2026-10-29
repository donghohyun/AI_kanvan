// 보드 아이콘. 16px 격자에 currentColor로 그려 테마 색을 따른다.
// 칸반 상태는 채운 정도가 다른 원, 실행 상태는 모양이 다른 기호로 구분한다.

import type { ReactNode } from 'react';
import type { KanbanStatus, RunStatus } from '../core/types';

const Svg = ({ children, className, label }: { children: ReactNode; className?: string; label?: string }) => (
  <svg
    className={`icon${className ? ` ${className}` : ''}`}
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  >
    {children}
  </svg>
);

/** 칸반 상태: 시작 전(점선 원) → 진행 중(반) → 리뷰(3/4) → 완료(체크). 보류는 멈춤 기호. */
export function StatusIcon({ status, label }: { status: KanbanStatus; label?: string }) {
  return (
    <Svg className={`status-icon s-${status}`} label={label}>
      {status === 'todo' && <circle cx="8" cy="8" r="6" strokeDasharray="2.4 2.2" />}
      {status === 'in_progress' && (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5a3.5 3.5 0 0 1 0 7z" fill="currentColor" stroke="none" />
        </>
      )}
      {status === 'review' && (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5a3.5 3.5 0 1 1 -3.5 3.5h3.5z" fill="currentColor" stroke="none" />
        </>
      )}
      {status === 'suspended' && (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M6.5 5.8v4.4M9.5 5.8v4.4" />
        </>
      )}
      {status === 'done' && (
        <>
          <circle cx="8" cy="8" r="6.5" fill="currentColor" stroke="none" />
          <path d="M5.3 8.2l1.9 1.9 3.6-3.8" stroke="var(--vscode-editor-background)" strokeWidth="1.6" />
        </>
      )}
    </Svg>
  );
}

/** 에이전트 실행 상태 */
export function RunIcon({ status, label }: { status: RunStatus; label?: string }) {
  return (
    <Svg className={`run-icon r-${status}`} label={label}>
      {status === 'waiting' && <circle cx="8" cy="8" r="4.5" />}
      {status === 'running' && <path className="spin" d="M8 2.5a5.5 5.5 0 1 1 -5.5 5.5" />}
      {status === 'input_required' && (
        <>
          <path d="M4 11h8l-1.1-1.6V7a2.9 2.9 0 0 0 -5.8 0v2.4z" />
          <path d="M6.8 13h2.4" />
        </>
      )}
      {status === 'stopping' && <path d="M6 4.5v7M10 4.5v7" />}
      {status === 'stopped' && <rect x="4.5" y="4.5" width="7" height="7" rx="1" />}
      {status === 'ended' && <path d="M3.8 8.4l2.7 2.7 5.7-6" />}
      {status === 'error' && (
        <>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M6 6l4 4M10 6l-4 4" />
        </>
      )}
      {status === 'unknown' && (
        <>
          <circle cx="8" cy="8" r="5.5" />
          <path d="M6.6 6.4a1.5 1.5 0 1 1 2.1 1.4c-.5.2-.7.6-.7 1.1M8 11h0" />
        </>
      )}
    </Svg>
  );
}

export const BranchIcon = () => (
  <Svg className="meta-icon">
    <circle cx="5" cy="3.8" r="1.4" />
    <circle cx="5" cy="12.2" r="1.4" />
    <circle cx="11" cy="5.5" r="1.4" />
    <path d="M5 5.2v5.6M11 6.9c0 2.6-6 1.6-6 3.9" />
  </Svg>
);

export const LinkIcon = () => (
  <Svg className="meta-icon">
    <path d="M6.8 9.2l2.4-2.4M7.2 4.6l1-1a2.4 2.4 0 0 1 3.4 3.4l-1 1M8.8 11.4l-1 1a2.4 2.4 0 0 1 -3.4 -3.4l1-1" />
  </Svg>
);

export const BellIcon = () => (
  <Svg>
    <path d="M4 11h8l-1.1-1.6V7a2.9 2.9 0 0 0 -5.8 0v2.4z" />
    <path d="M6.8 13h2.4" />
  </Svg>
);

export const GearIcon = () => (
  <Svg>
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
  </Svg>
);
