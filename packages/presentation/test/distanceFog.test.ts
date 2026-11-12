// biome-ignore-all lint/style/useNamingConvention: three.js shader chunk names retain their exact spelling.
import { PerspectiveCamera, ShaderChunk, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { installDistanceFog, withDistanceFog } from '../src/render/distanceFog.ts';

// Test-owned far-plane scales, from the schema's minimum up, so no case depends on the bundled tuning.
const SCALES = [1, 1.1, 1.5, 3];
const SCALE = 1.5;
const SHAPE = { farPlaneScale: SCALE, curveExponent: 2 };

interface Vec {
  xyz: [number, number, number];
}

const FOG_DISTANCE_BODY = /float fogDistance\(\) \{([\s\S]*?)\n\s*\}/;
const COLUMN = /viewMatrix\[ (\d) \]\.xyz/g;
const FOG_FACTOR = /float fogFactor = (pow\(.*\));/;
const PLAIN_FOG_VIEW = /(?<!centroid )varying vec3 vFogView;/;

/**
 * Runs the patched fragment chunk's `fogDistance` body as JavaScript, so the test checks the shader
 * text itself. GLSL indexes a matrix by column, so `viewMatrix[ i ]` is three's column i.
 */
const fogDistanceOf = (scale: number) => {
  const pars = withDistanceFog(ShaderChunk, { ...SHAPE, farPlaneScale: scale }).fog_pars_fragment;
  const body = FOG_DISTANCE_BODY.exec(pars)?.[1];
  if (!body) {
    throw new Error('fogDistance not found');
  }
  const run = new Function(
    'viewMatrix',
    'vFogView',
    'dot',
    'max',
    'sqrt',
    body.replaceAll('float ', 'const ').replaceAll(COLUMN, 'viewMatrix[$1].xyz'),
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

/** Points around the eye at several bearings, distances and heights, near and far below and above it. */
const ringPoints = (eye: Vector3): Vector3[] =>
  [0, 30, 45, 90, 200].flatMap((bearing) => {
    const angle = (bearing * Math.PI) / 180;
    return [5, 80].flatMap((reach) =>
      [-48, 20, 60].map((y) => new Vector3(eye.x + Math.sin(angle) * reach, y, eye.z + Math.cos(angle) * reach)),
    );
  });

// three.js's own fog chunks are the thing under test: the patch must find each line it replaces.
describe('distance fog', () => {
  it('replaces view depth with fogDistance() in all four fog chunks', () => {
    const patched = withDistanceFog(ShaderChunk, SHAPE);
    const all = Object.values(patched).join('\n');
    expect(all).not.toContain('vFogDepth');
    expect(all).not.toContain('mvPosition.z');
    expect(patched.fog_fragment).toContain('fogDistance()');
    // Centroid, so an MSAA edge pixel takes its distance from inside its triangle.
    for (const pars of [patched.fog_pars_vertex, patched.fog_pars_fragment]) {
      expect(pars).toContain('centroid varying vec3 vFogView;');
      expect(pars).not.toMatch(PLAIN_FOG_VIEW);
    }
  });

  it('throws when three changes a line, rather than fogging wrong silently', () => {
    expect(() => withDistanceFog({ ...ShaderChunk, fog_vertex: 'vFogDepth = mvPosition.z;' }, SHAPE)).toThrow(
      'not found',
    );
  });

  it('rejects a far-plane scale below one', () => {
    for (const scale of [0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => withDistanceFog(ShaderChunk, { ...SHAPE, farPlaneScale: scale })).toThrow('far-plane scale');
    }
  });

  it('closes the fog over its band by the content curve, fully at the fog end', () => {
    const [near, far] = [20, 80];
    for (const curveExponent of [0.5, 1, 2.5]) {
      const line = withDistanceFog(ShaderChunk, { ...SHAPE, curveExponent }).fog_fragment;
      const expression = FOG_FACTOR.exec(line)?.[1];
      if (!expression) {
        throw new Error('fog factor not found');
      }
      const factor = new Function('fogDistance', 'fogNear', 'fogFar', 'pow', 'clamp', `return ${expression};`) as (
        ...args: unknown[]
      ) => number;
      const at = (distance: number) =>
        factor(
          () => distance,
          near,
          far,
          Math.pow,
          (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x)),
        );
      expect(at(near)).toBe(0);
      expect(at(far)).toBe(1);
      expect(at(far * 2)).toBe(1);
      expect(at(50)).toBeCloseTo(0.5 ** curveExponent, 3);
    }
  });

  it('fogs a point by max(horizontal, straight-line / scale), whichever way the camera faces', () => {
    const eye = towerCamera(0).position;
    const branches = new Set<string>();
    for (const scale of SCALES) {
      const fogDistance = fogDistanceOf(scale);
      for (const point of ringPoints(eye)) {
        const horizontal = Math.hypot(point.x - eye.x, point.z - eye.z);
        const expected = Math.max(horizontal, point.distanceTo(eye) / scale);
        branches.add(expected === horizontal ? 'horizontal' : 'straight-line');
        for (const cameraYaw of [0, 45, -45, 170]) {
          expect(fogDistance(towerCamera(cameraYaw), point)).toBeCloseTo(expected, 6);
        }
      }
    }
    // Both terms of the contract decided some case.
    expect([...branches].sort()).toEqual(['horizontal', 'straight-line']);
  });

  it('fogs fully before the far plane clips, at any yaw and scale', () => {
    const fogEnd = 50;
    const steps = [-200, -150, -100, -50, 0, 50, 100, 150, 200];
    const points = steps.flatMap((x) => steps.flatMap((z) => [-48, 0, 80].map((y) => new Vector3(x, y, z))));
    for (const scale of SCALES) {
      const fogDistance = fogDistanceOf(scale);
      for (const cameraYaw of [0, 45]) {
        const camera = towerCamera(cameraYaw);
        const clipped = points.filter(
          (point) => -point.clone().applyMatrix4(camera.matrixWorldInverse).z > fogEnd * scale,
        );
        expect(clipped.length).toBeGreaterThan(0);
        expect(Math.min(...clipped.map((point) => fogDistance(camera, point)))).toBeGreaterThanOrEqual(fogEnd);
      }
    }
  });

  it('patches the shared chunks once with the given shape, and refuses another', () => {
    installDistanceFog(SHAPE);
    const once = ShaderChunk.fog_fragment;
    installDistanceFog({ ...SHAPE });
    expect(ShaderChunk.fog_fragment).toBe(once);
    expect(() => installDistanceFog({ ...SHAPE, farPlaneScale: SCALE + 1 })).toThrow('already installed');
    expect(() => installDistanceFog({ ...SHAPE, curveExponent: 3 })).toThrow('already installed');
    expect(ShaderChunk.fog_fragment).toBe(once);
  });
});
