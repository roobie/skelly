import { describe, expect, it } from 'vitest';
import { buildRegistry, loadActorFigureFiles, readActorFigureFiles } from '../src/engine/content.ts';
import { stackActorFigureFiles, startupContentSources } from './baseContentFiles.ts';

const json = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

describe('actor figure loader', () => {
  const { registry, issues } = buildRegistry(startupContentSources());

  it('decodes every figure row of the stack, synchronously and by fetch alike', async () => {
    expect(issues).toEqual([]);
    const read = stackActorFigureFiles(registry);
    expect([...read.keys()].sort()).toEqual([...registry.actorFigures.keys()].sort());
    for (const [id, { body }] of read) {
      expect(`${body.type}.${body.seed}`).toBe(id);
    }
    const files = new Map<string, Uint8Array>();
    for (const [id, row] of registry.actorFigures) {
      const { source } = registry.contentOrigins.get(`actorFigures:${id}`)!;
      const figure = read.get(id)!;
      files.set(`${source}:${row.body}`, json(figure.body));
      files.set(`${source}:${row.clips}`, json(figure.clips));
      files.set(`${source}:${row.mesh}`, figure.mesh);
    }
    const fetched = await loadActorFigureFiles(registry, (source, path) =>
      Promise.resolve(files.get(`${source}:${path}`)!),
    );
    expect([...fetched.keys()]).toEqual([...read.keys()]);
    for (const [id, { mesh, ...decoded }] of read) {
      const { mesh: fetchedMesh, ...fetchedDecoded } = fetched.get(id)!;
      expect(fetchedDecoded).toEqual(decoded);
      // The loader keeps the bytes it read, so identity checks the mesh without an element-wise compare of every GLB.
      expect(fetchedMesh).toBe(mesh);
    }
  });

  it('refuses a figure file its schema rejects, naming the row', () => {
    const [id] = registry.actorFigures.keys();
    expect(() => readActorFigureFiles(registry, () => json({}))).toThrow(`Actor figure ${id!}:`);
  });
});
