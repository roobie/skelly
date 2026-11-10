import type { InlineConfig, ViteDevServer } from 'vite';

export function stageServerConfig(config: InlineConfig): InlineConfig;
export function createStageServer(config: InlineConfig): Promise<ViteDevServer>;
