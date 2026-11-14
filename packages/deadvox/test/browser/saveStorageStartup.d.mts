export interface SaveStorageStartupAddress {
  port: number;
}

export interface SaveStorageStartupOptions {
  browserName: string;
  productionBundleStage: boolean;
  stageId: string;
  build: () => Promise<unknown>;
  preview: () => Promise<SaveStorageStartupAddress>;
  devServer: () => Promise<SaveStorageStartupAddress>;
  timeoutMs: number;
  now?: () => number;
  schedule?: (fire: () => void, ms: number) => unknown;
  cancel?: (timer: unknown) => void;
  write?: (line: string) => void;
  writeError?: (line: string) => void;
}

export interface SaveStorageStartup {
  withTimeout: <T>(label: string, task: Promise<T>, boundMs?: number) => Promise<T>;
  navigationPhaseLog: <T>(label: string, action: () => Promise<T>) => Promise<T>;
  navigationPhase: <T>(label: string, action: () => Promise<T>) => Promise<T>;
  startStageServer: () => Promise<SaveStorageStartupAddress>;
}

export function createSaveStorageStartup(options: SaveStorageStartupOptions): SaveStorageStartup;
