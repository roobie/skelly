import type { DataTexture } from 'three';

/** Keep queued changes until a consumer uploads: shadow and colour passes may skip a sync.
 * Three's ranges must stay inside a physical row, even when adjacent rows both change. */
export class PoseTextureUpdates {
  private readonly texture: DataTexture;
  private readonly canvas: HTMLCanvasElement | undefined;
  private previous: Uint32Array;
  private readonly touched = new Set<number>();
  private full = true;
  private width = 0;
  private height = 0;
  private readonly lost = (): void => {
    this.full = true;
    this.texture.clearUpdateRanges();
    this.texture.needsUpdate = true;
  };

  constructor(texture: DataTexture, canvas?: HTMLCanvasElement) {
    this.texture = texture;
    this.canvas = canvas;
    this.previous = new Uint32Array(0);
    texture.onUpdate = () => {
      if (this.full) {
        this.previous = this.bits().slice();
      }
      this.width = texture.image.width;
      this.height = texture.image.height;
      this.full = false;
    };
    canvas?.addEventListener('webglcontextlost', this.lost);
  }

  private bits(): Uint32Array {
    const data = this.texture.image.data!;
    return new Uint32Array(data.buffer, data.byteOffset, data.byteLength / 4);
  }

  touch(row: number): void {
    this.touched.add(row);
  }

  flush(): void {
    const data = this.bits();
    if (this.full || this.texture.image.width !== this.width || this.texture.image.height !== this.height) {
      this.full = true;
      this.texture.clearUpdateRanges();
      this.texture.needsUpdate = true;
      this.touched.clear();
      return;
    }
    const rowComponents = this.texture.image.width * 4;
    let dirty = false;
    for (const row of this.touched) {
      const start = row * rowComponents;
      const end = start + rowComponents;
      let first = end;
      let last = start;
      for (let i = start; i < end; i++) {
        if (data[i] !== this.previous[i]) {
          first = Math.min(first, i);
          last = i;
          this.previous[i] = data[i]!;
        }
      }
      if (first < end) {
        const aligned = Math.floor(first / 4) * 4;
        this.texture.addUpdateRange(aligned, (Math.floor(last / 4) + 1) * 4 - aligned);
        dirty = true;
      }
    }
    this.touched.clear();
    if (dirty) {
      this.texture.needsUpdate = true;
    }
  }

  dispose(): void {
    this.canvas?.removeEventListener('webglcontextlost', this.lost);
  }
}
