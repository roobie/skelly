import type { Rgb, Sky } from '@skelly/engine/sky';
import {
  Color,
  DataTexture,
  DataUtils,
  EquirectangularReflectionMapping,
  HalfFloatType,
  LinearFilter,
  LinearSRGBColorSpace,
  MathUtils,
  PMREMGenerator,
  RGBAFormat,
  SRGBColorSpace,
  type Texture,
  type WebGLRenderer,
  type WebGLRenderTarget,
} from 'three';

/** What vehicle finishes reflect. A real sky bake (#1542) replaces the source behind this and nothing else. */
export interface ReflectionMap {
  readonly texture: Texture;
  update: (sky: Sky) => void;
}

export interface GradientTuning {
  /** Edge of one cube face, in texels. */
  readonly cubeSize: number;
  /** The largest change in any sky colour channel that leaves the map as it stands. */
  readonly skyDrift: number;
  /** The height of a view direction, as its sine, at which the horizon has given way to the zenith. */
  readonly zenithHeight: number;
  /** Half the width of the band, as a sine, over which the ground gives way to the horizon. */
  readonly groundEdge: number;
}

const coloursOf = (sky: Sky): readonly Rgb[] => [sky.sky, sky.heightFogColor, sky.ambientGround];

const mixed = (from: Color, to: Color, amount: number): Color => from.clone().lerp(to, amount);

/** A pre-filtered map of the sky's own gradient, redrawn only as the sky drifts, into one target whose texture stays put. */
export class GradientSkyReflection implements ReflectionMap {
  private readonly generator: PMREMGenerator;
  private readonly source: DataTexture;
  private readonly target: WebGLRenderTarget;
  private readonly tuning: GradientTuning;
  private shown: readonly Rgb[] | undefined;

  constructor(renderer: WebGLRenderer, tuning: GradientTuning) {
    this.tuning = tuning;
    this.generator = new PMREMGenerator(renderer);
    const width = tuning.cubeSize * 4;
    const height = tuning.cubeSize * 2;
    this.source = new DataTexture(new Uint16Array(width * height * 4), width, height, RGBAFormat, HalfFloatType);
    this.source.mapping = EquirectangularReflectionMapping;
    this.source.colorSpace = LinearSRGBColorSpace;
    this.source.minFilter = LinearFilter;
    this.source.magFilter = LinearFilter;
    this.source.needsUpdate = true;
    // Built at load so the generator's own shaders never compile during play.
    this.target = this.generator.fromEquirectangular(this.source);
  }

  get texture(): Texture {
    return this.target.texture;
  }

  update(sky: Sky): void {
    const colours = coloursOf(sky);
    if (this.shown && !this.drifted(colours)) {
      return;
    }
    this.shown = colours;
    this.paint(colours);
    this.generator.fromEquirectangular(this.source, this.target);
  }

  private drifted(colours: readonly Rgb[]): boolean {
    return colours.some((colour, stop) =>
      colour.some((channel, index) => Math.abs(channel - this.shown![stop]![index]!) > this.tuning.skyDrift),
    );
  }

  /** Every texel of a row shares one height, so a row is worked out once and repeated. */
  private paint(colours: readonly Rgb[]): void {
    const [zenith, horizon, ground] = colours.map((colour) => new Color().setRGB(...colour, SRGBColorSpace)) as [
      Color,
      Color,
      Color,
    ];
    const { width, height } = this.source.image;
    const data = this.source.image.data as Uint16Array;
    const { zenithHeight, groundEdge } = this.tuning;
    const opaque = DataUtils.toHalfFloat(1);
    for (let row = 0; row < height; row++) {
      const y = Math.sin(((row + 0.5) / height - 0.5) * Math.PI);
      const above = mixed(horizon, zenith, MathUtils.smoothstep(y, 0, zenithHeight));
      const { r, g, b } = mixed(ground, above, MathUtils.smoothstep(y, -groundEdge, groundEdge));
      const start = row * width * 4;
      data.set([DataUtils.toHalfFloat(r), DataUtils.toHalfFloat(g), DataUtils.toHalfFloat(b), opaque], start);
      for (let column = 1; column < width; column++) {
        data.copyWithin(start + column * 4, start, start + 4);
      }
    }
    this.source.needsUpdate = true;
  }
}
