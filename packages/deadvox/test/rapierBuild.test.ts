import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { awaitRapier, ColliderDesc, Ray, RigidBodyDesc, rapierWasmUrl, World } from '../src/core/rapier.ts';

const vendor = new URL('../vendor/rapier-f64/', import.meta.url);
const tools = new URL('../tools/rapier-f64/', import.meta.url);
const digest = (url: URL) => createHash('sha256').update(readFileSync(url)).digest('hex');

describe('committed Rapier supply', () => {
  it('materializes only pinned sources even with checkout extras and inherited Git bindings', () => {
    execFileSync('python3', ['-B', fileURLToPath(new URL('build_test.py', tools))], { stdio: 'pipe' });
  });

  it('matches the generated provenance and the regeneration inputs', () => {
    const provenance = JSON.parse(readFileSync(new URL('provenance.json', vendor), 'utf8')) as {
      inputs: Record<string, string>;
      files: Record<string, string>;
      typescript: string;
    };
    const files = readdirSync(vendor, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => relative(fileURLToPath(vendor), join(entry.parentPath, entry.name)))
      .filter((path) => path !== 'provenance.json');
    expect(files.sort()).toEqual(Object.keys(provenance.files).sort());
    for (const [path, expected] of Object.entries(provenance.files)) {
      expect(digest(new URL(path, vendor)), path).toBe(expected);
    }
    expect(Object.keys(provenance.inputs).length).toBeGreaterThan(0);
    for (const [path, expected] of Object.entries(provenance.inputs)) {
      expect(digest(new URL(path, tools)), path).toBe(expected);
    }
    const typescript = JSON.parse(
      readFileSync(new URL('../../../node_modules/typescript/package.json', import.meta.url), 'utf8'),
    ) as { version: string };
    expect(provenance.typescript).toBe(typescript.version);
  });
});

describe('Rapier supply seam', () => {
  it('initializes the vendored bytes once and answers queries from two awaiters', async () => {
    const wasm = new Uint8Array(readFileSync(rapierWasmUrl()));
    const first = awaitRapier(wasm);
    // A second init is a no-op: both callers share one promise and one module instance.
    expect(awaitRapier()).toBe(first);
    await first;
    const world = new World({ x: 0, y: -9.81, z: 0 });
    try {
      world.createCollider(ColliderDesc.cuboid(0.05, 1, 1.5).setTranslation(0.85, 1, 1.5));
      // The query pipelines update on step, so the world advances once before probing.
      world.step();
      const towards = world.castRayAndGetNormal(new Ray({ x: 0, y: 1, z: 1.5 }, { x: 1, y: 0, z: 0 }), 10, true);
      expect(towards?.timeOfImpact).toBeGreaterThan(0);
      expect(Number.isFinite(towards!.normal.x)).toBe(true);
      expect(world.castRay(new Ray({ x: 0, y: 1, z: 1.5 }, { x: -1, y: 0, z: 0 }), 10, true)).toBe(null);
      const body = world.createRigidBody(RigidBodyDesc.dynamic().setTranslation(0.85, 4, 1.5).setCanSleep(false));
      world.createCollider(ColliderDesc.ball(0.1), body);
      const started = body.translation().y;
      for (let step = 0; step < 60; step++) {
        world.step();
      }
      expect(body.translation().y).toBeLessThan(started);
    } finally {
      world.free();
    }
  });
});
