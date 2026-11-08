import { describe, expect, it } from 'vitest';
import { loadActorFigureFiles, readActorFigureFiles } from '../src/core/actorFigureFiles.ts';
import { buildRegistry } from '../src/core/content.ts';
import { stackActorFigureFiles, startupContentSources } from './baseContentFiles.ts';

describe('actor figure loader', () => {
  const { registry, issues } = buildRegistry(startupContentSources());

  it('decodes every figure row of the stack, synchronously and by fetch alike', async () => {
    expect(issues).toEqual([]);
    const read = stackActorFigureFiles(registry);
    expect([...read.keys()].sort()).toEqual([...registry.actorFigures.keys()].sort());
    for (const [id, { body }] of read) {
      expect(`${body.type}.${body.seed}`).toBe(id);
    }
    const files = new Map<string, unknown>();
    for (const [id, row] of registry.actorFigures) {
      const { source } = registry.contentOrigins.get(`actorFigures:${id}`)!;
      files.set(`${source}:${row.body}`, read.get(id)!.body);
      files.set(`${source}:${row.clips}`, read.get(id)!.clips);
    }
    const fetched = await loadActorFigureFiles(registry, (source, path) =>
      Promise.resolve(files.get(`${source}:${path}`)),
    );
    expect(fetched).toEqual(read);
  });

  it('refuses a figure file its schema rejects, naming the row', () => {
    const [id] = registry.actorFigures.keys();
    expect(() => readActorFigureFiles(registry, () => ({}))).toThrow(`Actor figure ${id!}:`);
  });
});
