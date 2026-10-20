import type { ToolId } from '../core/types';
import { claudeAdapter } from './claude';
import { codexAdapter } from './codex';
import { cursorAdapter } from './cursor';
import type { Adapter } from './types';

export const ADAPTERS: Record<ToolId, Adapter> = {
  claude: claudeAdapter,
  codex: codexAdapter,
  cursor: cursorAdapter,
};
