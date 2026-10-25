// Browser-side witness for the underwater pixel check: the depth the chunk meshes leave at the frame centre.
import {
  Color,
  FloatType,
  Mesh,
  type PerspectiveCamera,
  Scene,
  ShaderMaterial,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three';
import type { ChunkMeshes } from '../../src/render/chunks.ts';

/**
 * Redraws only the chunk meshes from the game camera into one float pixel at the frame centre and
 * returns the depth there: 1, the far plane, when no chunk face covers the centre. The chunk material's
 * face culling is kept, so a surface wound away from the camera leaves the far plane.
 */
export const centreDepth = ({
  renderer,
  camera,
  meshes,
}: {
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  meshes: ChunkMeshes;
}): number => {
  const material = new ShaderMaterial({
    vertexShader: 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }',
  });
  const scene = new Scene();
  meshes.group.updateMatrixWorld(true);
  for (const chunk of meshes.group.children) {
    if (chunk instanceof Mesh) {
      const copy = new Mesh(chunk.geometry, material);
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(chunk.matrixWorld);
      scene.add(copy);
    }
  }
  const target = new WebGLRenderTarget(1, 1, { type: FloatType });
  const previous = renderer.getRenderTarget();
  const clearColor = renderer.getClearColor(new Color());
  const clearAlpha = renderer.getClearAlpha();
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0xff_00_00, 1);
    renderer.clear();
    renderer.render(scene, camera);
    const pixel = new Float32Array(4);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
    return pixel[0]!;
  } finally {
    renderer.setRenderTarget(previous);
    renderer.setClearColor(clearColor, clearAlpha);
    target.dispose();
    material.dispose();
  }
};
