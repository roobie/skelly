import {
  DataTexture,
  FloatType,
  HalfFloatType,
  RGBAFormat,
  ShaderMaterial,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import type { NightVision } from '../../src/core/schema.ts';
import { realSeconds } from '../../src/core/time.ts';
import { createMoodOutputPass, setNightFlareUniforms } from '../../src/render/moodOutput.ts';
import { NO_FLARE } from '../../src/render/nightVisionFlare.ts';

const SIZE = 64;
const VIEW: NightVision = {
  gain: 2,
  tint: '#40ff60',
  grain: 0,
  edge: { darkening: 0.9, inner: 0.4, outer: 0.5 },
  flare: { strength: 1, distanceMetres: 1, blastIntensity: 1, recoverRealSeconds: realSeconds(1), haloRadius: 0.1 },
};
const HALO = { x: 0.5, y: 0.5 };
const CROP = { from: 0.3, to: 0.7 };

interface Crop {
  /** Mean of the channels, 0 to 255. */
  readonly brightness: number;
  /** Brightest channel less the dimmest, 0 to 255: how far the colour is from grey. */
  readonly spread: number;
}

/** Renders a dim scene through the night-vision output with the flare off and on, and reads back the crops. */
export function nightVisionFlareProof(): {
  readonly plain: Crop;
  readonly flared: Crop;
  readonly halo: number;
  readonly corner: number;
} {
  const renderer = new WebGLRenderer();
  renderer.setSize(SIZE, SIZE);
  const input = new WebGLRenderTarget(SIZE, SIZE, { type: HalfFloatType, depthBuffer: false });
  const result = new WebGLRenderTarget(SIZE, SIZE, { depthBuffer: false });
  const source = new DataTexture(new Float32Array([0.04, 0.04, 0.04, 1]), 1, 1, RGBAFormat, FloatType);
  source.needsUpdate = true;
  const output = createMoodOutputPass();
  const u = output.uniforms;
  u.uNightVision!.value = 1;
  u.uNightGain!.value = VIEW.gain;
  u.uNightTint!.value = [0.25, 1, 0.38];
  u.uNightGrain!.value = VIEW.grain;
  u.uNightEdge!.value = [VIEW.edge.darkening, VIEW.edge.inner, VIEW.edge.outer];
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const read = (x: number, y: number) => pixels.subarray((y * SIZE + x) * 4, (y * SIZE + x) * 4 + 3);
  const cropOf = (): Crop => {
    let brightness = 0;
    let spread = 0;
    let count = 0;
    const from = Math.round(CROP.from * SIZE);
    const to = Math.round(CROP.to * SIZE);
    for (let y = from; y < to; y++) {
      for (let x = from; x < to; x++) {
        const [r, g, b] = read(x, y);
        brightness += (r! + g! + b!) / 3;
        spread += Math.max(r!, g!, b!) - Math.min(r!, g!, b!);
        count += 1;
      }
    }
    return { brightness: brightness / count, spread: spread / count };
  };
  const meanAt = (share: { x: number; y: number }): number => {
    const [r, g, b] = read(Math.round(share.x * SIZE), Math.round(share.y * SIZE));
    return (r! + g! + b!) / 3;
  };
  try {
    const sourceMaterial = new ShaderMaterial({
      uniforms: { source: { value: source } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader:
        'uniform sampler2D source; varying vec2 vUv; void main() { gl_FragColor = texture2D(source, vUv); }',
    });
    const quad = new FullScreenQuad(sourceMaterial);
    try {
      renderer.setRenderTarget(input);
      quad.render(renderer);
    } finally {
      quad.dispose();
      sourceMaterial.dispose();
    }
    const frame = (flare: Parameters<typeof setNightFlareUniforms>[2]) => {
      setNightFlareUniforms(output, VIEW, flare);
      output.render(renderer, result, input, 0, false);
      renderer.readRenderTargetPixels(result, 0, 0, SIZE, SIZE, pixels);
    };
    frame(NO_FLARE);
    const plain = cropOf();
    const plainHalo = meanAt(HALO);
    const plainCorner = meanAt({ x: CROP.to, y: CROP.to });
    frame({ washout: 0.4, halos: [{ ...HALO, strength: 0.9 }] });
    const flared = cropOf();
    return {
      plain,
      flared,
      halo: meanAt(HALO) - plainHalo,
      corner: meanAt({ x: CROP.to, y: CROP.to }) - plainCorner,
    };
  } finally {
    input.dispose();
    result.dispose();
    source.dispose();
    output.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}
