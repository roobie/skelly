import { Mesh, Raycaster, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { expect, it } from 'vitest';
import exportRecipe from '../exports/deadvox.json' with { type: 'json' };
import appearance from '../src/gun/appearance.json' with { type: 'json' };
import { exportAttachmentGlb } from '../src/gun/attachmentExport.ts';
import { METRES_PER_UNIT } from '../src/gun/exportFrame.ts';
import { getOptic } from '../src/gun/optics.ts';

it('hunting export keeps the full disc-to-lip annulus opaque', async () => {
  const optic = getOptic('hunting-3-9x');
  const row = exportRecipe.find(({ id }) => id === 'optic_hunting_3_9x')!;
  const result = exportAttachmentGlb(
    'optic-hunting-3-9x',
    { id: 'fixture-scope', file: 'assets/models/fixture-scope.glb' },
    undefined,
    { voxelGrain: row.voxel.grain, voxelDetailGrain: row.voxel.detailGrain },
  );
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(JSON.stringify(result.error));
  }
  const { scene } = await new GLTFLoader().parseAsync(result.glb.slice().buffer, '');
  scene.updateMatrixWorld(true);
  const metal: Mesh[] = [];
  scene.traverse((object) => {
    if (object instanceof Mesh && object.geometry.userData.slot === 'metal' && !object.geometry.userData.piece) {
      metal.push(object);
    }
  });
  expect(metal.length).toBeGreaterThan(0);
  const body = optic.solids.find(({ id }) => id === 'hunting-ocular');
  if (body?.kind !== 'revolved') {
    throw new Error('Expected the authored ocular body');
  }
  const discRadius = optic.ocularOpeningDiameterU / 2;
  const [, lipRadius] = body.profile[0]!;
  expect(lipRadius).toBeGreaterThan(discRadius);
  const eye = new Vector3(optic.ocularX - optic.eyeReliefU!, optic.opticalAxisY, 0).multiplyScalar(METRES_PER_UNIT);
  try {
    for (let facet = 0; facet < appearance.opticBodySides * 8; facet++) {
      const angle = (facet * 2 * Math.PI) / (appearance.opticBodySides * 8);
      for (const fraction of [0.1, 0.5, 0.9]) {
        const radius = discRadius + (lipRadius - discRadius) * fraction;
        const target = new Vector3(
          optic.ocularX,
          optic.opticalAxisY + radius * Math.cos(angle),
          radius * Math.sin(angle),
        ).multiplyScalar(METRES_PER_UNIT);
        const ray = new Raycaster(eye, target.sub(eye).normalize());
        expect(ray.intersectObjects(metal).length, `opaque tube at facet ${facet} radius ${fraction}`).toBeGreaterThan(
          0,
        );
      }
    }
  } finally {
    scene.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return;
      }
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        material.dispose();
      }
    });
  }
});
