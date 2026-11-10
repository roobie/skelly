import { DataTexture, FloatType, RGBAFormat, Vector2, type WebGLRenderer } from 'three';

/** Keep queued changes until a consumer uploads: shadow and colour passes may skip a sync.
 * Three's ranges must stay inside a physical row, even when adjacent rows both change. */
export class PoseTextureUpdates {
  private readonly texture: DataTexture;
  private readonly canvas: HTMLCanvasElement | undefined;
  private previous: Uint32Array;
  private readonly touched = new Set<number>();
  private readonly source = new DataTexture(undefined, 1, 1, RGBAFormat, FloatType);
  private readonly destination = new Vector2();
  private full = true;
  private contextLost = false;
  private width = 0;
  private height = 0;
  private readonly restored = (): void => {
    this.contextLost = false;
  };
  private readonly lost = (): void => {
    this.contextLost = true;
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
    canvas?.addEventListener('webglcontextrestored', this.restored);
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
      }
    }
    this.touched.clear();
  }

  upload(renderer: Pick<WebGLRenderer, 'initTexture' | 'copyTextureToTexture'>): void {
    if (this.contextLost) {
      return;
    }
    renderer.initTexture(this.texture);
    const { data, width } = this.texture.image;
    const ranges = this.texture.updateRanges;
    ranges.sort((a, b) => a.start - b.start);
    for (let i = 0; i < ranges.length; i += 1) {
      const { start, count } = ranges[i]!;
      let end = start + count;
      const row = Math.floor(start / (width * 4));
      while (i + 1 < ranges.length) {
        const next = ranges[i + 1]!;
        if (next.start > end || Math.floor(next.start / (width * 4)) !== row) {
          break;
        }
        end = Math.max(end, next.start + next.count);
        i += 1;
      }
      // Firefox can serialize skipped texels too; bound the view instead of using UNPACK_*.
      this.source.image = { data: data!.subarray(start, end), width: (end - start) / 4, height: 1 };
      this.destination.set((start / 4) % width, Math.floor(start / (width * 4)));
      renderer.copyTextureToTexture(this.source, this.texture, null, this.destination);
    }
    this.texture.clearUpdateRanges();
  }

  dispose(): void {
    this.canvas?.removeEventListener('webglcontextlost', this.lost);
    this.canvas?.removeEventListener('webglcontextrestored', this.restored);
    this.source.dispose();
  }
}
