// The mood pass: bloom, colour grade, vignette and film grain on top of the scene, plus the
// height-fog mist. All of it is optional and cheap; with `post` off the frame is drawn
// straight to the screen with `renderer.render`, exactly as before the pass existed.
//
// Pipeline (post on), all in an MSAA half-float linear target until the last step:
//   RenderPass (scene) -> hands -> bloom -> output (tone mapping + sRGB + grade/film) -> screen
// Tone mapping happens exactly once, in OutputPass, which reads the renderer's `toneMapping`
// and `toneMappingExposure` (what the debug look controls set). three.js skips its own
// per-material tone mapping while rendering to a target, so nothing is applied twice. The
// grade runs after its transfer function, in display space, within the same fullscreen draw.
// Bloom therefore works in pre-exposure linear light: its threshold is the tone mapper's clip / exposure
// (core/mood.ts), set each frame, so it follows what OutputPass will push towards white.

import {
  ACESFilmicToneMapping,
  type Camera,
  Color,
  CustomToneMapping,
  HalfFloatType,
  type Material,
  Mesh,
  NeutralToneMapping,
  type Object3D,
  type PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  type ToneMapping,
  Vector2,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import type { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import type { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import {
  BLOOM_RADIUS,
  bloomClipFor,
  bloomThreshold,
  clampBloomClip,
  clampGrade,
  GRAIN,
  gradeParams,
  type MoodState,
  targetColorScale,
  VIGNETTE,
} from '../core/mood.ts';
import type { OpticLensFrame, ReticleKind } from '../core/opticView.ts';
import type { Sky } from '../core/sky.ts';
import { autoToneUniforms, installAutoToneMapping, setAutoToneWeight } from './autoTone.ts';
import { DrawPass } from './drawPass.ts';
import { heightFogUniforms } from './heightFog.ts';
import { toneKeyOf } from './look.ts';
import { createMoodOutputPass } from './moodOutput.ts';
import { bloomRenderScale, sceneRenderScale } from './moodQuality.ts';
import { OpticLensRenderer, opticLensPass } from './opticLens.ts';

const RETICLE_UNIFORM: Record<ReticleKind, number> = { dot: 0, crosshair: 1, chevron: 2 };

/** MSAA samples of the scene target; the default framebuffer's `antialias: true` doesn't reach a composer. */
const MSAA_SAMPLES = 4;

/**
 * The tone mapping for drawing straight to the screen: plain materials have no weight uniform for `auto`
 * (render/autoTone.ts), so it draws with whichever of its two curves the weight is nearer.
 */
const screenToneMapping = (mapping: ToneMapping): ToneMapping => {
  if (mapping !== CustomToneMapping) {
    return mapping;
  }
  return autoToneUniforms.autoToneWeight.value >= 0.5 ? ACESFilmicToneMapping : NeutralToneMapping;
};

export class Mood {
  private readonly renderer: WebGLRenderer;
  private readonly scene: Scene;
  private readonly camera: PerspectiveCamera;
  // Everything off until the game turns it on, so the benchmark renders as it always did.
  private state: MoodState = { post: false, bloom: false, film: false, grade: 0, bloomClip: null };
  private width = 1;
  private height = 1;
  private renderScaleValue = 1;
  private bloomScaleValue = 1;
  private frame = 0;
  private skyBloom = 0;
  private skyMist = 0;
  private painDesaturation = 0;
  private crackOn = false;
  private readonly crackColor = new Color();
  private composer: EffectComposer | undefined;
  private readonly drawPass = new DrawPass();
  private readonly opticLens = new OpticLensRenderer();
  private opticPass: ShaderPass | undefined;
  private bloomPass: UnrealBloomPass | undefined;
  private outputPass: OutputPass | undefined;

  constructor(renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    installAutoToneMapping();
  }

  get post(): boolean {
    return this.state.post;
  }

  get bloom(): boolean {
    return this.state.bloom;
  }

  get film(): boolean {
    return this.state.film;
  }

  get grade(): number {
    return this.state.grade;
  }

  /** The bloom clip override; null while it follows the active tone mapper. */
  get bloomClip(): number | null {
    return this.state.bloomClip;
  }

  /** Takes a whole state, as read from the defaults or the URL. */
  restore(state: MoodState): void {
    this.state = {
      ...state,
      grade: clampGrade(state.grade),
      bloomClip: state.bloomClip === null ? null : clampBloomClip(state.bloomClip),
    };
    this.sync();
  }

  /** The clip bloom uses now: the override, or the active tone mapper's derived value. */
  effectiveBloomClip(): number {
    const tone = toneKeyOf(this.renderer.toneMapping);
    return this.state.bloomClip ?? bloomClipFor(tone, autoToneUniforms.autoToneWeight.value);
  }

  setBloomClip(clip: number | null): void {
    this.restore({ ...this.state, bloomClip: clip });
  }

  setPost(on: boolean): void {
    this.restore({ ...this.state, post: on });
  }

  setBloom(on: boolean): void {
    this.restore({ ...this.state, bloom: on });
  }

  setFilm(on: boolean): void {
    this.restore({ ...this.state, film: on });
  }

  setGrade(strength: number): void {
    this.restore({ ...this.state, grade: strength });
  }

  /**
   * Takes the sky's bloom strength and mist (the sky as weather has shaped it, core/weather.ts);
   * cheap enough to call every frame.
   */
  setSky(sky: Sky, skyVisibility = 1): void {
    // sRGB in, working (linear) colour out: the mist is mixed in while the scene is still linear.
    setAutoToneWeight(sky.tone);
    const [r, g, b] = sky.heightFogColor;
    heightFogUniforms.uHeightFogColor.value.setRGB(r, g, b, SRGBColorSpace).multiplyScalar(skyVisibility);
    if (sky.bloom !== this.skyBloom || sky.heightFog !== this.skyMist) {
      this.skyBloom = sky.bloom;
      this.skyMist = sky.heightFog;
      this.sync();
    }
  }

  /**
   * Drains colour for the pain cue (`src/game/painCue.ts`), 0 to 1 on top of the grade; cheap enough to call
   * every frame. It shows only with post on, as the grade does.
   */
  setPainDesaturation(amount: number): void {
    const clamped = Math.min(1, Math.max(0, amount));
    if (clamped !== this.painDesaturation) {
      this.painDesaturation = clamped;
      this.sync();
    }
  }

  get renderScale(): number {
    return this.renderScaleValue;
  }

  setRenderScale(value: number): void {
    this.renderScaleValue = sceneRenderScale(value);
    this.composer?.setPixelRatio(this.renderer.getPixelRatio() * this.renderScaleValue);
  }

  get bloomScale(): number {
    return this.bloomScaleValue;
  }

  setBloomScale(value: number): void {
    this.bloomScaleValue = bloomRenderScale(value);
    this.composer?.setSize(this.width, this.height);
  }

  /** Follows the renderer's size, in CSS pixels. */
  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.composer?.setSize(width, height);
  }

  /**
   * Draws the frame. `drawHands` draws the held items on top of the scene: into the post chain
   * when post is on, onto the screen when it's off.
   */
  render(drawHands: () => void, opticFrame?: OpticLensFrame): void {
    // Crack check: only the clear colour changes (the fog on geometry keeps the sky colour), so
    // magenta shows exactly where no geometry covered the sample. Post-on scales it like the sky.
    const { background } = this.scene;
    if (this.crackOn) {
      this.crackColor.setRGB(1, 0, 1);
      if (this.state.post) {
        this.crackColor.multiplyScalar(targetColorScale(this.renderer.toneMappingExposure));
      }
      this.scene.background = this.crackColor;
    }
    try {
      this.draw(drawHands, opticFrame);
    } finally {
      this.scene.background = background;
    }
  }

  /** Debug crack check (see `render`). */
  get crackCheck(): boolean {
    return this.crackOn;
  }

  setCrackCheck(on: boolean): void {
    this.crackOn = on;
  }

  private draw(drawHands: () => void, opticFrame?: OpticLensFrame): void {
    if (!(this.state.post || opticFrame)) {
      const { renderer } = this;
      const chosen = renderer.toneMapping;
      renderer.toneMapping = screenToneMapping(chosen);
      try {
        renderer.render(this.scene, this.camera);
        drawHands();
      } finally {
        renderer.toneMapping = chosen;
      }
      return;
    }
    const composer = this.ensureComposer();
    this.drawPass.draw = drawHands;
    this.updateOpticPass(opticFrame);
    // A new seed each frame animates the grain; any irrational-ish step will do.
    this.frame = (this.frame + 1) % 4096;
    this.outputPass!.uniforms.uSeed!.value = (this.frame * 97.31) % 1000;
    // Bloom sees the linear frame before OutputPass applies exposure, so its threshold follows the
    // exposure and the tone mapper (the debug controls change both at any time) to keep selecting
    // what will be near white.
    const exposure = this.renderer.toneMappingExposure;
    this.bloomPass!.threshold = bloomThreshold(exposure, this.effectiveBloomClip());
    // The clear colour, the distance fog and the mist all land in the linear target and then get
    // the exposure from OutputPass, which would push a bright sky past the bloom threshold and
    // brighten it against the no-post frame. Scaled by 1 / exposure for this frame, they come out
    // as the sky's own colour. All three scale alike, so geometry still fades into the background
    // exactly at the far plane. The originals are put back afterwards (scene.background is the fog's
    // own Color, see applySky), so the post-off path and the next frame see the unscaled sky.
    const scale = targetColorScale(exposure);
    const fogColor = this.scene.fog?.color;
    const mist = heightFogUniforms.uHeightFogColor.value;
    const savedFog = fogColor?.clone();
    const savedMist = mist.clone();
    fogColor?.multiplyScalar(scale);
    mist.multiplyScalar(scale);
    try {
      if (opticFrame) {
        this.opticLens.prepare(this.renderer, this.scene, this.camera, opticFrame);
      }
      composer.render(0);
    } finally {
      if (fogColor && savedFog) {
        fogColor.copy(savedFog);
      }
      mist.copy(savedMist);
    }
  }

  private updateOpticPass(frame: OpticLensFrame | undefined): void {
    const opticPass = this.opticPass!;
    opticPass.enabled = frame !== undefined;
    if (!frame) {
      return;
    }
    const { uniforms } = opticPass;
    uniforms.uZoomTexture!.value = this.opticLens.texture;
    uniforms.uZoomActive!.value = frame.magnification > 1 ? 1 : 0;
    uniforms.uLensCenter!.value.set(...frame.center);
    uniforms.uLensRadius!.value.set(...frame.radius);
    uniforms.uReticleKind!.value = frame.reticleKind === undefined ? -1 : RETICLE_UNIFORM[frame.reticleKind];
  }

  /**
   * Starts compiling the shaders the first frames would otherwise stall on, in the state they will
   * draw in: the passes' own, and every material already in `scenes` (each with its own lights,
   * fog and camera), compiled for the post chain's linear target (three.js picks the output colour
   * space and tone mapping per program from the render target, so a screen compile would be a
   * different, useless program). With KHR_parallel_shader_compile the driver builds them off the
   * main thread. Resolves when they are ready to draw.
   */
  warmUp(scenes: readonly { scene: Scene; camera: Camera }[]): Promise<unknown> {
    const { renderer } = this;
    const compiling: Promise<unknown>[] = [];
    const compile = (into: WebGLRenderTarget | null, root: Object3D, view: Camera): void => {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(into);
      try {
        compiling.push(renderer.compileAsync(root, view));
      } finally {
        renderer.setRenderTarget(previous);
      }
    };
    if (!this.state.post) {
      // Compile for the curve `draw` will actually use under `auto`, not the custom one.
      const chosen = renderer.toneMapping;
      renderer.toneMapping = screenToneMapping(chosen);
      try {
        for (const { scene, camera } of scenes) {
          compile(null, scene, camera);
        }
      } finally {
        renderer.toneMapping = chosen;
      }
      return Promise.all(compiling);
    }
    const composer = this.ensureComposer();
    const target = composer.readBuffer;
    for (const { scene, camera } of scenes) {
      compile(target, scene, camera);
    }
    // The bloom materials draw from a quad of their own; a stand-in scene makes three.js build them.
    const quad = new PlaneGeometry(2, 2);
    const stand = (materials: readonly Material[]): Scene => {
      const holder = new Scene();
      for (const material of materials) {
        holder.add(new Mesh(quad, material));
      }
      return holder;
    };
    const bloom = this.bloomPass!;
    compile(
      target,
      stand([
        bloom.materialHighPassFilter,
        ...bloom.separableBlurMaterials,
        bloom.compositeMaterial,
        bloom.blendMaterial,
      ]),
      this.camera,
    );
    // OutputPass builds its defines from the renderer when it first renders, so it compiles then.
    return Promise.all(compiling).finally(() => quad.dispose());
  }

  /** The values the passes and shaders read, from the state and the sky. */
  private sync(): void {
    const { post, bloom, film, grade } = this.state;
    heightFogUniforms.uHeightFog.value.x = post ? this.skyMist : 0;
    if (!this.composer) {
      return;
    }
    const bloomPass = this.bloomPass!;
    bloomPass.enabled = bloom && this.skyBloom > 0;
    bloomPass.strength = this.skyBloom;
    const params = gradeParams(grade);
    const u = this.outputPass!.uniforms;
    u.uGradeEnabled!.value = grade > 0 || film || this.painDesaturation > 0 ? 1 : 0;
    u.uSaturation!.value = params.saturation * (1 - this.painDesaturation);
    u.uContrast!.value = params.contrast;
    u.uShadowTint!.value = [...params.shadowTint];
    u.uHighlightTint!.value = [...params.highlightTint];
    u.uVignette!.value = film ? VIGNETTE : 0;
    u.uGrain!.value = film ? GRAIN : 0;
  }

  /** Built on first use, so a run that never turns post on (the benchmark) allocates no targets. */
  private ensureComposer(): EffectComposer {
    if (this.composer) {
      return this.composer;
    }
    const ratio = this.renderer.getPixelRatio();
    const target = new WebGLRenderTarget(this.width * ratio, this.height * ratio, {
      type: HalfFloatType,
      samples: MSAA_SAMPLES,
      // No pass samples resolved depth; resolving it adds a depth blit per pass.
      resolveDepthBuffer: false,
    });
    const composer = new EffectComposer(this.renderer, target);
    composer.addPass(new RenderPass(this.scene, this.camera));
    composer.addPass(this.drawPass);
    this.opticPass = opticLensPass();
    this.opticPass.enabled = false;
    composer.addPass(this.opticPass);
    // UnrealBloomPass runs its blur chain from half of this resolution down.
    this.bloomPass = new UnrealBloomPass(
      new Vector2(this.width, this.height),
      0,
      BLOOM_RADIUS,
      bloomThreshold(this.renderer.toneMappingExposure, this.effectiveBloomClip()),
    );
    const resizeBloom = this.bloomPass.setSize.bind(this.bloomPass);
    this.bloomPass.setSize = (width, height) =>
      resizeBloom(Math.max(1, width * this.bloomScaleValue), Math.max(1, height * this.bloomScaleValue));
    composer.addPass(this.bloomPass);
    const output = createMoodOutputPass();
    // The `auto` tone mapping's weight (render/autoTone.ts); the same object every frame, so it needs no copying.
    output.uniforms.autoToneWeight = autoToneUniforms.autoToneWeight;
    composer.addPass(output);
    this.outputPass = output;
    // Keep the canvas and DOM at display resolution; only the post chain's input targets scale.
    composer.setPixelRatio(ratio * this.renderScaleValue);
    // The constructor treats a given target's size as CSS pixels' worth, so size everything here.
    composer.setSize(this.width, this.height);
    this.composer = composer;
    this.sync();
    return composer;
  }
}
