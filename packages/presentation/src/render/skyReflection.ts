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

/** What vehicle finishes reflect, kept to this so the world-following map of #1542 can replace the source alone. */
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
  /** How far below the horizon, as a sine, the ground starts giving way to it. */
  readonly groundEdge: number;
  /** The map's light against the hemisphere light's, where 1 makes a reflected colour as bright as it lights white. */
  readonly strength: number;
  /** How many times brighter the horizon stands than the rest of the map, the contrast that reads as gloss on a flat panel. */
  readonly horizonGain: number;
}

const readingsOf = (sky: Sky): readonly number[] => [
  ...sky.sky,
  ...sky.heightFogColor,
  ...sky.ambientGround,
  sky.ambientIntensity,
];

const lit = (colour: Rgb, scale: number): Color => new Color().setRGB(...colour, SRGBColorSpace).multiplyScalar(scale);

const mixed = (from: Color, to: Color, amount: number): Color => from.clone().lerp(to, amount);

/** A pre-filtered map of the sky's own gradient, redrawn only as the sky drifts, into one target whose texture stays put. */
export class GradientSkyReflection implements ReflectionMap {
  private readonly generator: PMREMGenerator;
  private readonly source: DataTexture;
  private readonly target: WebGLRenderTarget;
  private readonly tuning: GradientTuning;
  private shown: readonly number[] | undefined;

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
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.bake();
    });
  }

  get texture(): Texture {
    return this.target.texture;
  }

  update(sky: Sky): void {
    const readings = readingsOf(sky);
    if (this.shown && !this.drifted(readings)) {
      return;
    }
    this.shown = readings;
    this.paint(sky);
    this.bake();
  }

  /** A lost context takes the target's pixels with it, so the map is drawn again from the source it was made from. */
  private bake(): void {
    this.generator.fromEquirectangular(this.source, this.target);
  }

  private drifted(readings: readonly number[]): boolean {
    return readings.some((reading, index) => Math.abs(reading - this.shown![index]!) > this.tuning.skyDrift);
  }

  /**
   * The sky's colours are display colours, unrelated to how brightly the scene is lit, so each is put on the footing of
   * the hemisphere light: that light shows white at its intensity over pi. Every texel of a row shares one height, so a
   * row is worked out once and repeated.
   */
  private paint(sky: Sky): void {
    const { width, height } = this.source.image;
    const data = this.source.image.data as Uint16Array;
    const { zenithHeight, groundEdge, strength, horizonGain } = this.tuning;
    const light = (sky.ambientIntensity / Math.PI) * strength;
    const zenith = lit(sky.sky, light);
    const horizon = lit(sky.heightFogColor, light * horizonGain);
    const ground = lit(sky.ambientGround, light);
    const opaque = DataUtils.toHalfFloat(1);
    for (let row = 0; row < height; row++) {
      const y = Math.sin(((row + 0.5) / height - 0.5) * Math.PI);
      const above = mixed(horizon, zenith, MathUtils.smoothstep(y, 0, zenithHeight));
      const { r, g, b } = mixed(ground, above, MathUtils.smoothstep(y, -groundEdge, 0));
      const start = row * width * 4;
      data.set([DataUtils.toHalfFloat(r), DataUtils.toHalfFloat(g), DataUtils.toHalfFloat(b), opaque], start);
      for (let column = 1; column < width; column++) {
        data.copyWithin(start + column * 4, start, start + 4);
      }
    }
    this.source.needsUpdate = true;
  }
}
