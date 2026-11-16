import { buildReach, type ReachBuildInputs } from '@skelly/engine/reachBuild';

/** Demo only: one grid build from a copied occupancy snapshot. */
export interface HeldReachJob {
  inputs: Omit<ReachBuildInputs, 'isBlocking'>;
  min: [number, number, number];
  extent: number;
  blocking: Uint8Array;
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<HeldReachJob>) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

scope.onmessage = ({ data }) => {
  const { inputs, min, extent, blocking } = data;
  const start = performance.now();
  const steps = buildReach({
    ...inputs,
    isBlocking: (x, y, z) => blocking[x - min[0] + extent * (z - min[2] + extent * (y - min[1]))] !== 0,
  });
  let step = steps.next();
  while (!step.done) {
    step = steps.next();
  }
  const { origin, size, cellBlocks, cells, revision } = step.value;
  scope.postMessage({ origin, size, cellBlocks, cells, revision, ms: performance.now() - start }, [cells.buffer]);
};
