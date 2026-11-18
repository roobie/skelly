import type { InlineConfig, ViteDevServer } from 'vite';

export function stageServerConfig(config: InlineConfig): InlineConfig;
export function createStageServer(config: InlineConfig): Promise<ViteDevServer>;
export function listeningPort(server: Pick<ViteDevServer, 'httpServer'>): number;
