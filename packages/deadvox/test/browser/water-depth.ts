// Browser-side witness for the underwater pixel check: the depth the chunk meshes leave at the frame centre.

import type { ChunkMeshes } from '@skelly/presentation/render';
import { Color, FloatType, type PerspectiveCamera, ShaderMaterial, type WebGLRenderer, WebGLRenderTarget } from 'three';

/**
 * Redraws only the chunks the main pass draws, from the game camera, into one float pixel at the frame
 * centre and returns the depth there: 1, the far plane, when no chunk face covers the centre. The chunk
 * material's face culling is kept, so a surface wound away from the camera leaves the far plane.
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
    vertexShader: `#include <batching_pars_vertex>
void main() {
#include <batching_vertex>
#include <begin_vertex>
#include <project_vertex>
}`,
    fragmentShader: 'void main() { gl_FragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0); }',
  });
  const { batch } = meshes;
  const chunkMaterial = batch.material;
  const target = new WebGLRenderTarget(1, 1, { type: FloatType });
  const previous = renderer.getRenderTarget();
  const clearColor = renderer.getClearColor(new Color());
  const clearAlpha = renderer.getClearAlpha();
  try {
    batch.material = material;
    renderer.setRenderTarget(target);
    renderer.setClearColor(0xff_00_00, 1);
    renderer.clear();
    renderer.render(batch, camera);
    const pixel = new Float32Array(4);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, pixel);
    return pixel[0]!;
  } finally {
    batch.material = chunkMaterial;
    renderer.setRenderTarget(previous);
    renderer.setClearColor(clearColor, clearAlpha);
    target.dispose();
    material.dispose();
  }
};
