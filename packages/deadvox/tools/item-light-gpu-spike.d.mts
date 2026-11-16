import type { GpuReach } from '@skelly/presentation/render';

/** Throwaway GPU reach builder; the named input must be explicitly true. */
export function createItemLightGpuSpike(options?: { gpuReachSpike?: boolean }): GpuReach & {
  identity: { renderer: string; timer: boolean };
  drain(): Promise<void>;
  dispose(): void;
};
