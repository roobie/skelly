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
      let first = row * rowComponents;
      let last = first + rowComponents - 1;
      while (first <= last && data[first] === this.previous[first]) {
        first += 1;
      }
      if (first > last) {
        continue;
      }
      while (data[last] === this.previous[last]) {
        last -= 1;
      }
      this.previous.set(data.subarray(first, last + 1), first);
      const aligned = Math.floor(first / 4) * 4;
      this.texture.addUpdateRange(aligned, (Math.floor(last / 4) + 1) * 4 - aligned);
    }
    this.touched.clear();
  }

  /** Each call costs far more than a row's texels, so changed rows that touch go up as one rectangle. */
  upload(renderer: Pick<WebGLRenderer, 'initTexture' | 'copyTextureToTexture'>): void {
    if (this.contextLost) {
      return;
    }
    renderer.initTexture(this.texture);
    const { data, width } = this.texture.image;
    const rowComponents = width * 4;
    const ranges = this.texture.updateRanges;
    ranges.sort((a, b) => a.start - b.start);
    for (let i = 0; i < ranges.length; i += 1) {
      let { start } = ranges[i]!;
      let end = start + ranges[i]!.count;
      const firstRow = Math.floor(start / rowComponents);
      let lastRow = firstRow;
      while (i + 1 < ranges.length) {
        const next = ranges[i + 1]!;
        const row = Math.floor(next.start / rowComponents);
        if (row > lastRow + 1) {
          break;
        }
        lastRow = row;
        end = Math.max(end, next.start + next.count);
        i += 1;
      }
      if (lastRow > firstRow) {
        start = firstRow * rowComponents;
        end = (lastRow + 1) * rowComponents;
      }
      const height = lastRow - firstRow + 1;
      // Firefox can serialize skipped texels too; bound the view instead of using UNPACK_*.
      this.source.image = { data: data!.subarray(start, end), width: (end - start) / 4 / height, height };
      this.destination.set((start / 4) % width, firstRow);
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
