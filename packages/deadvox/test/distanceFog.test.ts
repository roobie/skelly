import { PerspectiveCamera, ShaderChunk, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import graphicsFile from '../src/content/base/graphics.json' with { type: 'json' };
import { installDistanceFog, withDistanceFog } from '../src/render/distanceFog.ts';

const SCALE = graphicsFile.graphics[0]!.fogFarPlaneScale;

type Vec = { xyz: [number, number, number] };

/**
 * Runs the patched fragment chunk's `fogDistance` body as JavaScript, so the test checks the shader
 * text itself. GLSL indexes a matrix by column, so `viewMatrix[ i ]` is three's column i.
 */
const fogDistanceOf = (scale: number) => {
  const pars = withDistanceFog(ShaderChunk, scale).fog_pars_fragment;
  const body = /float fogDistance\(\) \{([\s\S]*?)\n\s*\}/.exec(pars)?.[1];
  if (!body) {
    throw new Error('fogDistance not found');
  }
  const run = new Function(
    'viewMatrix',
    'vFogView',
    'dot',
    'max',
    'sqrt',
    body.replaceAll('float ', 'const ').replaceAll(/viewMatrix\[ (\d) \]\.xyz/g, 'viewMatrix[$1].xyz'),
  ) as (m: Vec[], v: Vec['xyz'], ...math: unknown[]) => number;
  const dot = (a: number[], b: number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return (camera: PerspectiveCamera, world: Vector3): number => {
    const e = camera.matrixWorldInverse.elements;
    const columns = [0, 1, 2, 3].map((i) => ({ xyz: [e[4 * i]!, e[4 * i + 1]!, e[4 * i + 2]!] as Vec['xyz'] }));
    const view = world.clone().applyMatrix4(camera.matrixWorldInverse);
    return run(columns, [view.x, view.y, view.z], dot, Math.max, Math.sqrt);
  };
};

/** A tower view like the review's: 70 m up, looking down a little. */
const towerCamera = (yawDegrees: number) => {
  const camera = new PerspectiveCamera(75, 1890 / 700, 0.05, 1000);
  camera.rotation.order = 'YXZ';
  camera.position.set(18, 70, 9);
  camera.rotation.set((-12 * Math.PI) / 180, (yawDegrees * Math.PI) / 180, 0);
  camera.updateMatrixWorld();
  return camera;
};

// three.js's own fog chunks are the thing under test: the patch must find each line it replaces.
describe('distance fog', () => {
  it('replaces view depth with fogDistance() in all four fog chunks', () => {
    const patched = withDistanceFog(ShaderChunk, SCALE);
    const all = Object.values(patched).join('\n');
    expect(all).not.toContain('vFogDepth');
    expect(all).not.toContain('mvPosition.z');
    expect(patched.fog_fragment).toContain('fogDistance()');
    // Centroid, so an MSAA edge pixel takes its distance from inside its triangle.
    for (const pars of [patched.fog_pars_vertex, patched.fog_pars_fragment]) {
      expect(pars).toContain('centroid varying vec3 vFogView;');
      expect(pars).not.toMatch(/(?<!centroid )varying vec3 vFogView;/);
    }
  });

  it('throws when three changes a line, rather than fogging wrong silently', () => {
    expect(() => withDistanceFog({ ...ShaderChunk, fog_vertex: 'vFogDepth = mvPosition.z;' }, SCALE)).toThrow(
      'not found',
    );
  });

  it('rejects a far-plane scale below one', () => {
    for (const scale of [0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => withDistanceFog(ShaderChunk, scale)).toThrow('far-plane scale');
    }
  });

  it('fogs a point by its horizontal distance, whichever way the camera faces', () => {
    const fogDistance = fogDistanceOf(SCALE);
    const eye = new Vector3(18, 0, 9);
    for (const groundY of [20, 60]) {
      for (const pointYaw of [0, 30, 45, 90, 200]) {
        const angle = (pointYaw * Math.PI) / 180;
        const point = eye.clone().add(new Vector3(Math.sin(angle) * 80, groundY, Math.cos(angle) * 80));
        for (const cameraYaw of [0, 45, -45, 170]) {
          expect(fogDistance(towerCamera(cameraYaw), point)).toBeCloseTo(80, 6);
        }
      }
    }
  });

  it('fogs fully before the far plane clips, at any yaw', () => {
    const fogDistance = fogDistanceOf(SCALE);
    const fogEnd = 50;
    let clipped = 0;
    for (const cameraYaw of [0, 45]) {
      const camera = towerCamera(cameraYaw);
      for (let x = -200; x <= 200; x += 25) {
        for (let z = -200; z <= 200; z += 25) {
          for (const y of [-48, 0, 80]) {
            const point = new Vector3(x, y, z);
            const depth = -point.clone().applyMatrix4(camera.matrixWorldInverse).z;
            if (depth > fogEnd * SCALE) {
              clipped++;
              expect(fogDistance(camera, point)).toBeGreaterThanOrEqual(fogEnd);
            }
          }
        }
      }
    }
    expect(clipped).toBeGreaterThan(0);
  });

  it('patches the shared chunks once with the given scale, and refuses another', () => {
    installDistanceFog(SCALE);
    const once = ShaderChunk.fog_fragment;
    installDistanceFog(SCALE);
    expect(ShaderChunk.fog_fragment).toBe(once);
    expect(() => installDistanceFog(SCALE + 1)).toThrow('already installed');
    expect(ShaderChunk.fog_fragment).toBe(once);
  });
});
