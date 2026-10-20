// Markdown을 canvas 컴포넌트로 그린다. canvas.tsx가 없는 카드의 기본 문서와 Markdown 공용 문서에 쓴다.

import type { ReactNode } from 'react';
import { documentBlocks, splitTag, type Block, type DocumentOptions } from './markdownParse';
import { useHostTheme } from './host';
import { Callout, Divider, H1, H2, H3, Pill, Stack, Table, Text } from './ui';
import { TodoList, type TodoItem } from './widgets';

function ListBlock({ block }: { block: Extract<Block, { kind: 'list' }> }) {
  const t = useHostTheme();
  if (block.items.length > 0 && block.items.every((x) => x.checked !== undefined)) {
    const todos: TodoItem[] = block.items.map((x, n) => ({ id: String(n), content: x.text, status: x.checked ? 'completed' : 'pending' }));
    return <TodoList todos={todos} />;
  }
  const Tag = block.ordered ? 'ol' : 'ul';
  return (
    <Tag style={{ margin: 0, paddingLeft: 20, color: t.text.primary, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {block.items.map((x, n) => (
        <li key={n} style={{ marginLeft: x.depth * 16 }}>
          <Text as="span">{x.text}</Text>
        </li>
      ))}
    </Tag>
  );
}

function CodeBlock({ text }: { text: string }) {
  const t = useHostTheme();
  return (
    <pre style={{ margin: 0, padding: 12, borderRadius: 8, background: t.fill.quaternary, border: `1px solid ${t.stroke.tertiary}`, overflowX: 'auto', fontSize: 12, lineHeight: '18px', fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
      {text}
    </pre>
  );
}

function HeadingBlock({ level, text }: { level: number; text: string }) {
  const { tag, title } = splitTag(text);
  const body: ReactNode = tag ? (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Pill size="sm">{tag}</Pill>
      {title}
    </span>
  ) : (
    text
  );
  if (level <= 1) return <H1>{body}</H1>;
  if (level === 2) return <H2 style={{ marginTop: 12 }}>{body}</H2>;
  return <H3 style={{ marginTop: 4 }}>{body}</H3>;
}

export function renderBlock(block: Block, key: number): ReactNode {
  switch (block.kind) {
    case 'heading':
      return <HeadingBlock key={key} level={block.level} text={block.text} />;
    case 'paragraph':
      return <Text key={key}>{block.text}</Text>;
    case 'list':
      return <ListBlock key={key} block={block} />;
    case 'table':
      return <Table key={key} headers={block.headers} rows={block.rows} columnAlign={block.align} />;
    case 'code':
      return <CodeBlock key={key} text={block.text} />;
    case 'quote':
      return (
        <Callout key={key} tone="neutral">
          {block.text}
        </Callout>
      );
    case 'rule':
      return <Divider key={key} />;
  }
}

/** Markdown 문서 전체를 canvas 스타일로 그린다. */
export function MarkdownDocument({ source, ...options }: { source: string } & DocumentOptions) {
  return <Stack gap={12}>{documentBlocks(source, options).map(renderBlock)}</Stack>;
}
