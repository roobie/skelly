import { DataTexture, FloatType, RGBAFormat } from 'three';
import { expect, it } from 'vitest';
import { PoseTextureUpdates } from '../src/render/poseTextureUpdates.ts';

it('retains queued row changes across unbound syncs, suppresses identical bits and fully uploads resized storage', () => {
  const texture = new DataTexture(new Float32Array(24), 3, 2, RGBAFormat, FloatType);
  const updates = new PoseTextureUpdates(texture);
  const uploaded = new Uint32Array(24);
  const upload = (): void => {
    const data = texture.image.data!;
    const bits = new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);
    if (texture.updateRanges.length === 0) {
      uploaded.set(bits);
    } else {
      for (const { start, count } of texture.updateRanges) {
        uploaded.set(bits.subarray(start, start + count), start);
      }
    }
    texture.clearUpdateRanges();
    texture.onUpdate?.(texture);
    expect(uploaded).toEqual(bits);
  };
  updates.flush();
  expect(texture.updateRanges).toHaveLength(0);
  upload();
  const data = texture.image.data as Float32Array;
  data[0] = -0;
  data[12] = 1;
  updates.touch(0);
  updates.touch(1);
  updates.flush();
  expect(texture.updateRanges).toHaveLength(2);
  data[12] = 0;
  updates.touch(1);
  updates.flush();
  upload();
  const { version } = texture;
  updates.touch(0);
  updates.flush();
  expect(texture.version).toBe(version);
  texture.image.width = 2;
  texture.image.height = 3;
  data[20] = 2;
  updates.flush();
  expect(texture.updateRanges).toHaveLength(0);
  upload();
  updates.dispose();
});
