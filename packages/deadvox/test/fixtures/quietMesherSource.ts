import type { MesherSource } from '@skelly/engine/mesh';

/** One mesher that accepts requests and never replies, for tests that build a world without meshing it. */
export const quietMesherSource = (): MesherSource => ({
  count: 1,
  create: () => ({ post: () => undefined, listen: () => undefined }),
});
