// md 문서에 끼워 넣는 그림. ```canvas 이름``` 블록 자리에 그림 파일의 같은 이름 컴포넌트를 그린다.
// md 글 자체는 DocEditing.tsx가 바로 고칠 수 있게 그린다.

import { createContext, useContext, type ComponentType } from 'react';
import { Boundary } from './runtime';
import { Callout } from './ui';

export interface FigureSet {
  components: Record<string, ComponentType>;
  /** 그림 파일을 쓸 수 없는 이유(변환 오류, 신뢰하지 않는 작업 공간 등) */
  unavailable?: string;
  onError?: (message: string) => void;
  /** 그림 코드가 바뀌면 오류 상태를 지우고 다시 그린다 */
  version?: string;
  /** 그 이름의 그림이 없을 때 보여 줄 글 */
  missing?: (name: string) => string;
}

export const FiguresContext = createContext<FigureSet>({ components: {} });

export function FigureBlock({ name }: { name: string }) {
  const { components, unavailable, onError, version, missing: missingText } = useContext(FiguresContext);
  const Figure = components[name];
  const missing = (message: string) => (
    <Callout tone="warning" title={`canvas ${name}`}>
      {message}
    </Callout>
  );
  if (!Figure) return missing(unavailable ?? missingText?.(name) ?? `No figure named ${name} in the canvas file.`);
  return (
    <div data-code-zone data-figure={name}>
      <Boundary key={version} onError={(m) => onError?.(`${name}: ${m}`)} fallback={missing}>
        <Figure />
      </Boundary>
    </div>
  );
}
