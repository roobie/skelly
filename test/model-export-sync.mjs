// biome-ignore-all lint/suspicious/noMisplacedAssertion: shared contract assertions run inside the caller's Node test.
import assert from 'node:assert/strict';

const glbJson = (bytes) =>
  JSON.parse(
    bytes
      .subarray(20, 20 + bytes.readUInt32LE(12))
      .toString()
      .trim(),
  );
export const assertVoxelized = ({ id, glb, voxel }) => {
  const grains = [voxel.grain, voxel.detailGrain].filter((grain) => grain !== undefined);
  const primitives = glbJson(Buffer.from(glb)).meshes.flatMap((mesh) => mesh.primitives);
  assert.ok(primitives.length > 0, `${id}: no meshes`);
  for (const { extras } of primitives) {
    assert.ok(grains.includes(extras?.voxelGrain), `${id}: a mesh is not voxelized on the row's class`);
  }
};
export const assertRecipeCredits = (recipe, manifest) => {
  const credited = new Set(manifest.sources.flatMap(({ files }) => files));
  for (const { id } of recipe) {
    assert.ok(credited.has(`assets/models/${id}.glb`), `${id}: missing asset credit`);
  }
};
