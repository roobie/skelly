import { DataTexture, FloatType, RGBAFormat, type WebGLRenderer } from 'three';
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

it('uploads only bounded changed texel views without reuploading the atlas', () => {
  const texture = new DataTexture(new Float32Array(24), 3, 2, RGBAFormat, FloatType);
  const canvas = new EventTarget() as HTMLCanvasElement;
  const updates = new PoseTextureUpdates(texture, canvas);
  const uploaded = new Uint32Array(24);
  let version = -1;
  let fullUploads = 0;
  const copies: number[][] = [];
  const renderer: Pick<WebGLRenderer, 'initTexture' | 'copyTextureToTexture'> = {
    initTexture(target) {
      if (version === target.version) {
        return;
      }
      expect(target).toBe(texture);
      const data = texture.image.data as Float32Array;
      uploaded.set(new Uint32Array(data.buffer, data.byteOffset, data.length));
      fullUploads += 1;
      ({ version } = target);
      target.onUpdate?.(target);
    },
    copyTextureToTexture(source, target, region, position) {
      expect(target).toBe(texture);
      expect(region).toBeNull();
      const { data, width, height } = source.image as { data: Float32Array; width: number; height: number };
      expect(height).toBe(1);
      expect(data.length).toBe(width * 4);
      expect(data.buffer).toBe(texture.image.data!.buffer);
      copies.push([position!.x, position!.y, data.length]);
      uploaded.set(new Uint32Array(data.buffer, data.byteOffset, data.length), (position!.y * 3 + position!.x) * 4);
    },
  };
  updates.flush();
  updates.upload(renderer);
  const data = texture.image.data as Float32Array;
  data[4] = -0;
  updates.touch(0);
  updates.flush();
  data[5] = 0.5;
  updates.touch(0);
  updates.flush();
  data[20] = 2;
  updates.touch(1);
  updates.flush();
  updates.upload(renderer);
  expect(copies).toEqual([
    [1, 0, 4],
    [2, 1, 4],
  ]);
  expect(fullUploads).toBe(1);
  expect(uploaded).toEqual(new Uint32Array(data.buffer));
  expect(texture.updateRanges).toHaveLength(0);
  updates.upload(renderer);
  expect(copies).toHaveLength(2);
  canvas.dispatchEvent(new Event('webglcontextlost'));
  uploaded.fill(0);
  updates.flush();
  updates.upload(renderer);
  expect(fullUploads).toBe(1);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  updates.upload(renderer);
  expect(fullUploads).toBe(2);
  expect(uploaded).toEqual(new Uint32Array(data.buffer));
  updates.dispose();
});
