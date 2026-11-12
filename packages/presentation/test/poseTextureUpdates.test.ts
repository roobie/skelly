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

/** A renderer double that mirrors what reaches GPU storage, so a test can compare it with the CPU copy. */
const mirrorRenderer = (texture: DataTexture) => {
  const { width } = texture.image;
  const mirror = {
    uploaded: new Uint32Array(texture.image.data!.length),
    version: -1,
    fullUploads: 0,
    copies: [] as { x: number; y: number; width: number; height: number }[],
    renderer: undefined as unknown as Pick<WebGLRenderer, 'initTexture' | 'copyTextureToTexture'>,
  };
  mirror.renderer = {
    initTexture(target) {
      if (mirror.version === target.version) {
        return;
      }
      expect(target).toBe(texture);
      const data = texture.image.data as Float32Array;
      mirror.uploaded.set(new Uint32Array(data.buffer, data.byteOffset, data.length));
      mirror.fullUploads += 1;
      mirror.version = target.version;
      target.onUpdate?.(target);
    },
    copyTextureToTexture(source, target, region, position) {
      expect(target).toBe(texture);
      expect(region).toBeNull();
      const image = source.image as { data: Float32Array; width: number; height: number };
      expect(image.data.length).toBe(image.width * image.height * 4);
      expect(image.data.buffer).toBe(texture.image.data!.buffer);
      expect(image.height === 1 || image.width === width).toBe(true);
      mirror.copies.push({ x: position!.x, y: position!.y, width: image.width, height: image.height });
      const bits = new Uint32Array(image.data.buffer, image.data.byteOffset, image.data.length);
      mirror.uploaded.set(bits, (position!.y * width + position!.x) * 4);
    },
  };
  return mirror;
};

it('uploads only bounded changed texel views without reuploading the atlas', () => {
  const texture = new DataTexture(new Float32Array(36), 3, 3, RGBAFormat, FloatType);
  const canvas = new EventTarget() as HTMLCanvasElement;
  const updates = new PoseTextureUpdates(texture, canvas);
  const mirror = mirrorRenderer(texture);
  const { renderer, copies, uploaded } = mirror;
  updates.flush();
  updates.upload(renderer);
  const data = texture.image.data as Float32Array;
  data[4] = -0;
  updates.touch(0);
  updates.flush();
  data[5] = 0.5;
  updates.touch(0);
  updates.flush();
  data[32] = 2;
  updates.touch(2);
  updates.flush();
  updates.upload(renderer);
  expect(copies).toEqual([
    { x: 1, y: 0, width: 1, height: 1 },
    { x: 2, y: 2, width: 1, height: 1 },
  ]);
  expect(mirror.fullUploads).toBe(1);
  expect(uploaded).toEqual(new Uint32Array(data.buffer));
  expect(texture.updateRanges).toHaveLength(0);
  updates.upload(renderer);
  expect(copies).toHaveLength(2);
  canvas.dispatchEvent(new Event('webglcontextlost'));
  uploaded.fill(0);
  updates.flush();
  updates.upload(renderer);
  expect(mirror.fullUploads).toBe(1);
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  updates.upload(renderer);
  expect(mirror.fullUploads).toBe(2);
  expect(uploaded).toEqual(new Uint32Array(data.buffer));
  updates.dispose();
});

it('sends each run of adjacent moving actor rows as one upload and leaves every pose row exact', () => {
  const width = 4;
  const rows = 12;
  const texture = new DataTexture(new Float32Array(width * rows * 4), width, rows, RGBAFormat, FloatType);
  const updates = new PoseTextureUpdates(texture);
  const mirror = mirrorRenderer(texture);
  updates.flush();
  updates.upload(mirror.renderer);
  const moving = [0, 1, 2, 5, 6, 9, 11];
  const runs = moving.filter((row, i) => i === 0 || row !== moving[i - 1]! + 1).length;
  const data = texture.image.data as Float32Array;
  for (let frame = 1; frame <= 2; frame += 1) {
    mirror.copies.length = 0;
    for (const row of moving) {
      // A moving actor rewrites a different span of its row each frame, as bones move and masks hold still.
      const first = row * width * 4 + (frame + row) % width;
      data.fill(frame * 100 + row, first, first + 5);
      updates.touch(row);
    }
    updates.flush();
    updates.upload(mirror.renderer);
    expect(mirror.copies).toHaveLength(runs);
    for (const copy of mirror.copies) {
      for (let row = copy.y; row < copy.y + copy.height; row += 1) {
        expect(moving).toContain(row);
      }
    }
    expect(mirror.uploaded).toEqual(new Uint32Array(data.buffer));
  }
  expect(mirror.fullUploads).toBe(1);
  updates.dispose();
});
