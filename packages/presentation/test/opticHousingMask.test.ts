import {
  BoxGeometry,
  Color,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import { expect, it } from 'vitest';
import { OpticHousingMask } from '../src/render/opticHousingMask.ts';
import { OPTIC_BODY_LAYER } from '../src/render/shadowFlags.ts';

it('isolates the silhouette from the world scene and restores renderer state even if drawing throws', () => {
  const geometry = new BoxGeometry();
  const opaque = new MeshBasicMaterial();
  const glass = new MeshBasicMaterial({ transparent: true, opacity: 0.1 });
  const materials = [opaque, glass];
  const owner = new Mesh(geometry, materials);
  owner.layers.set(OPTIC_BODY_LAYER);
  owner.position.set(1, 2, 3);
  const unrelated = new Mesh(geometry, opaque);
  const scene = new Scene().add(owner, unrelated);
  const background = new Color(0x12_34_56);
  const override = new MeshBasicMaterial();
  scene.background = background;
  scene.overrideMaterial = override;
  const previous = new WebGLRenderTarget();
  let target: WebGLRenderTarget | null = previous;
  const clear = new Color(0x23_45_67);
  const originalClear = clear.clone();
  let alpha = 0.25;
  const camera = new PerspectiveCamera();
  camera.layers.enable(OPTIC_BODY_LAYER);
  const layers = camera.layers.mask;
  const failure = new Error('mask draw failed');
  const renderer = {
    autoClear: false,
    getDrawingBufferSize: (out: { set: (x: number, y: number) => unknown }) => out.set(8, 8),
    getRenderTarget: () => target,
    setRenderTarget: (next: WebGLRenderTarget | null) => {
      target = next;
    },
    getClearColor: (out: Color) => out.copy(clear),
    getClearAlpha: () => alpha,
    setClearColor: (colour: Color | number, nextAlpha: number) => {
      clear.set(colour);
      alpha = nextAlpha;
    },
    render: (maskScene: Scene, mask: PerspectiveCamera) => {
      expect(maskScene).not.toBe(scene);
      expect(maskScene.background).toBeNull();
      expect(maskScene.overrideMaterial).toBeNull();
      expect(mask.layers.test(owner.layers)).toBe(true);
      expect(mask.layers.test(unrelated.layers)).toBe(false);
      expect(maskScene.children).toHaveLength(1);
      const proxy = maskScene.children[0] as Mesh<BoxGeometry, MeshBasicMaterial[]>;
      expect(proxy.geometry).toBe(geometry);
      maskScene.updateMatrixWorld(true);
      expect(proxy.matrixWorld.equals(owner.matrixWorld)).toBe(true);
      expect(proxy.material[0]!.visible).toBe(true);
      expect(proxy.material[1]!.visible).toBe(false);
      expect(owner.material).toBe(materials);
      expect(scene.background).toBe(background);
      expect(scene.overrideMaterial).toBe(override);
      expect(clear.getHex()).toBe(0);
      expect(alpha).toBe(1);
      expect(target).not.toBe(previous);
      throw failure;
    },
  } as unknown as WebGLRenderer;
  const housing = new OpticHousingMask();
  try {
    expect(() => housing.prepare(renderer, scene, camera)).toThrow(failure);
    expect(owner.material).toBe(materials);
    expect(unrelated.material).toBe(opaque);
    expect(target).toBe(previous);
    expect(clear.equals(originalClear)).toBe(true);
    expect(alpha).toBe(0.25);
    expect(renderer.autoClear).toBe(false);
    expect(camera.layers.mask).toBe(layers);
  } finally {
    housing.dispose();
    geometry.dispose();
    opaque.dispose();
    glass.dispose();
    override.dispose();
    previous.dispose();
  }
});
