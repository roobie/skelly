import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Stages load runtime modules by the URL Vite's dev server gives the engine's files, the URL the
// game's own imports load, so the stage shares the game's module instances.
const engineSource = dirname(fileURLToPath(import.meta.resolve('@skelly/engine/sim')));
const deadvoxRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

// A stage serving another checkout's Deadvox root (an A/B run) passes that root, so the URL names
// the engine that checkout's game loads.
export const engineModule = (path, root) => {
  const source = root === undefined || resolve(root) === deadvoxRoot ? engineSource : resolve(root, '../engine/src');
  return `/@fs${source}/${path}`;
};
