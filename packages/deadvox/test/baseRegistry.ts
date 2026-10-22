import { readFileSync } from 'node:fs';
import { deserialize } from 'node:v8';
import { safeParse } from 'valibot';
import { inject } from 'vitest';
import { type ContentSource, type Registry, schemaIssues } from '../src/core/content.ts';
import { CONTENT_SECTION_KEYS, ContentFileSchema } from '../src/core/schema.ts';
import { terrainShapeOf } from '../src/core/sitePalette.ts';
import type { TerrainShape } from '../src/core/worldgen.ts';
import type { StartupContent } from '../src/game/bundledContent.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    baseRegistryPath: string;
    startupContentPath: string;
  }
}

// Deserialize per caller so even nested mutable content is never shared between fixtures.
export const baseRegistry = (): Registry => deserialize(readFileSync(inject('baseRegistryPath'))) as Registry;

export const baseTerrainShape = (): TerrainShape => terrainShapeOf(baseRegistry());

export const startupContent = (): StartupContent =>
  deserialize(readFileSync(inject('startupContentPath'))) as StartupContent;

/**
 * Lays content files over a registry the caller owns, with the same per-section override as a build,
 * for a case whose rule needs the base content but not a whole-registry reference check. Each file
 * is still parsed against the content schema; a case about admission builds with `buildRegistry`.
 */
export const overlayContent = (registry: Registry, sources: readonly ContentSource[]): Registry => {
  for (const { source, data } of sources) {
    const parsed = safeParse(ContentFileSchema, data);
    if (!parsed.success) {
      throw new Error(`Invalid overlay ${source}: ${JSON.stringify(schemaIssues(source, parsed.issues))}`);
    }
    const file = parsed.output;
    if (file.blocks !== undefined || file.dayCycle !== undefined) {
      throw new Error(`Overlay ${source} defines blocks or a day cycle; build the registry instead`);
    }
    for (const section of CONTENT_SECTION_KEYS) {
      if (section === 'blocks') {
        continue;
      }
      (file[section] ?? []).forEach((def, i) => {
        (registry[section] as Map<string, typeof def>).set(def.id, def);
        registry.contentOrigins.set(`${section}:${def.id}`, { source, path: `${section}[${i}]` });
      });
    }
    (file.models ?? []).forEach((model, i) => {
      registry.modelOrigins.set(model.id, { source, path: `models[${i}]` });
    });
    (file.sounds ?? []).forEach((sound, i) => {
      registry.soundOrigins.set(sound.id, { source, path: `sounds[${i}]` });
    });
  }
  return registry;
};

/** The base registry with content files laid over it. */
export const baseRegistryWith = (sources: readonly ContentSource[]): Registry =>
  overlayContent(baseRegistry(), sources);
