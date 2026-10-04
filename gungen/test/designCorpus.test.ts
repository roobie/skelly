import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkDesignFiles } from '../src/cli/designCheck.ts';
import { worldSolid } from '../src/core/geometry.ts';
import { applyPoint, extrusionPoint, IDENTITY, type Vec3 } from '../src/core/math.ts';
import { resolve } from '../src/core/resolve.ts';
import type { Assembly, Solid } from '../src/core/schema.ts';
import { loadGunDesign } from '../src/gun/designLoader.ts';
import { gunDomain } from '../src/gun/domain.ts';
import { loadFixtures } from './helpers.ts';

const DESIGNS = join(import.meta.dirname, '..', 'designs');
const PUBLISH_CHECK = join(import.meta.dirname, 'fixtures', 'publish-check');

const localVertices = (solid: Solid): Vec3[] => {
  if (solid.kind === 'box') {
    const { center, half } = solid.box;
    const [xmin, ymin, zmin] = center.map((value, axis) => value - half[axis]!);
    const [xmax, ymax, zmax] = center.map((value, axis) => value + half[axis]!);
    return [xmin!, xmax!].flatMap((x) => [ymin!, ymax!].flatMap((y) => [zmin!, zmax!].map((z) => [x, y, z] as const)));
  }
  if (solid.kind === 'revolved') {
    const hull = worldSolid(IDENTITY, solid);
    if ('vertices' in hull) {
      return [...hull.vertices];
    }
    throw new Error('revolved solids must resolve to convex hulls');
  }
  if (solid.clip?.length) {
    const polyhedron = worldSolid(IDENTITY, solid);
    if ('vertices' in polyhedron) {
      return [...polyhedron.vertices];
    }
  }
  return solid.profile.flatMap((point) => solid.z.map((along) => extrusionPoint(solid.axis, point, along)));
};

const roundedGeometry = (assembly: Assembly) => {
  const resolved = resolve(assembly, gunDomain);
  return [...resolved.defs.entries()]
    .flatMap(([partId, def]) => {
      const transform = resolved.placed.get(partId);
      if (!transform) {
        return [];
      }
      return def.solids.map((solid) => ({
        partId,
        id: solid.id,
        kind: solid.kind,
        geometry: localVertices(solid)
          .map((point) => applyPoint(transform, point).map((coordinate) => Math.round(coordinate * 1e6) / 1e6))
          .sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]! || a[2]! - b[2]!),
      }));
    })
    .sort((a, b) => a.partId.localeCompare(b.partId) || a.id.localeCompare(b.id));
};

const byName = new Map(loadFixtures().map((fixture) => [fixture.name, fixture]));
const designFiles = () =>
  readdirSync(DESIGNS)
    .filter((file) => file.endsWith('.json'))
    .sort();

const mustLoad = (text: string) => {
  const result = loadGunDesign(text);
  if (!result.ok) {
    throw new Error(`${result.error.code}: ${result.error.message}`);
  }
  return result;
};

describe('published design corpus', () => {
  // Measured about 3 s on a loaded host (load 4-10), too much of vitest's 5 s default; the explicit timeout, about 5x that, keeps it from flaking under load.
  it('loads every published design and agrees with its source fixture', { timeout: 15_000 }, () => {
    const files = designFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const design = JSON.parse(readFileSync(join(DESIGNS, file), 'utf8')) as {
        template: string;
        status: string;
        assembly: Assembly;
      };
      const result = mustLoad(JSON.stringify(design));
      expect(result.declaredStatus, file).toBe('published');
      expect(result.issues, file).toEqual([]);
      expect(result.design.status, file).toBe('published');
      const source = byName.get(design.assembly.name);
      expect(source, file).toBeDefined();
      if (source) {
        expect(roundedGeometry(result.design.assembly), file).toEqual(roundedGeometry(source));
        expect(result.design.assembly.connections, file).toEqual(source.connections);
      }
    }
  });

  it('refuses a family that the template does not allow', () => {
    const design = JSON.parse(readFileSync(join(DESIGNS, 'archetype-ar.json'), 'utf8')) as {
      assembly: Assembly;
      [key: string]: unknown;
    };
    const assembly: Assembly = {
      ...design.assembly,
      parts: { ...design.assembly.parts, 'front-sight': { family: 'gas-block' } },
    };
    const result = mustLoad(JSON.stringify({ ...design, assembly }));
    expect(result.design.status).toBe('draft');
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        code: 'template-choice',
        path: 'assembly.parts.front-sight.family',
        parts: ['front-sight'],
      }),
    );
  });

  it('the publish check passes the corpus', () => {
    const result = checkDesignFiles(designFiles().map((file) => join(DESIGNS, file)));
    expect(result.exitCode).toBe(0);
    expect(result.lines).toHaveLength(designFiles().length);
    expect(result.lines.every((line) => line.startsWith('PASS '))).toBe(true);
  });

  it('the publish check fails an invalid published test design', () => {
    const result = checkDesignFiles([join(PUBLISH_CHECK, 'invalid-published.json')]);
    expect(result.exitCode).toBe(1);
    expect(result.lines[0]).toContain('FAIL invalid-published.json');
  });

  it('the publish check accepts an invalid draft test design', () => {
    const result = checkDesignFiles([join(PUBLISH_CHECK, 'invalid-draft.json')]);
    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toContain('PASS invalid-draft.json');
  });
});
