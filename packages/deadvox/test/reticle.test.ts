import { type Reticle, ReticleSchema, reticleScale } from '@skelly/thing-core/reticle';
import { safeParse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { opticLensPass, setReticleUniforms } from '../src/render/opticLens.ts';

const reticle: Reticle = {
  focalPlane: 'first',
  referenceMagnification: 8,
  primitives: [
    { kind: 'dot', center: [0, 0], radius: 0.02, color: [1, 0, 0] },
    { kind: 'ring', center: [0, 0], radius: 0.3, width: 0.01, color: [1, 0, 0] },
    { kind: 'line', from: [-0.5, 0], to: [0.5, 0], width: 0.01, color: [0, 0, 0] },
  ],
};

describe('reticle boundary', () => {
  it('rejects marks crossing the reference lens, degenerate lines and empty pictures', () => {
    expect(safeParse(ReticleSchema, reticle).success).toBe(true);
    for (const primitive of reticle.primitives) {
      const outside = primitive.kind === 'line' ? { ...primitive, to: [1, 0] } : { ...primitive, center: [1, 0] };
      expect(safeParse(ReticleSchema, { ...reticle, primitives: [outside] }).success).toBe(false);
    }
    expect(
      safeParse(ReticleSchema, { ...reticle, primitives: [{ ...reticle.primitives[2], from: [0, 0], to: [0, 0] }] })
        .success,
    ).toBe(false);
    expect(safeParse(ReticleSchema, { ...reticle, primitives: [] }).success).toBe(false);
  });

  it('scales first-plane marks with power but keeps second-plane marks fixed', () => {
    const low = 2;
    const high = 6;
    expect(reticleScale(reticle, high) / reticleScale(reticle, low)).toBe(high / low);
    expect(reticleScale({ ...reticle, focalPlane: 'second' }, high)).toBe(
      reticleScale({ ...reticle, focalPlane: 'second' }, low),
    );
  });

  it('packs every primitive and clears the previous sight picture when no reticle is active', () => {
    const pass = opticLensPass();
    const frame = { center: [0.5, 0.5] as const, radius: [0.2, 0.2] as const, magnification: 4 };
    setReticleUniforms(pass, { ...frame, reticle });
    expect(pass.uniforms.uReticleCount!.value).toBe(reticle.primitives.length);
    expect(pass.uniforms.uReticleScale!.value).toBe(reticleScale(reticle, frame.magnification));
    for (const [index, primitive] of reticle.primitives.entries()) {
      expect(pass.uniforms.uReticleColor!.value[index].toArray()).toEqual(primitive.color);
      const geometry = pass.uniforms.uReticleGeometry!.value[index].toArray();
      const style = pass.uniforms.uReticleStyle!.value[index].toArray();
      if (primitive.kind === 'line') {
        expect(geometry).toEqual([...primitive.from, ...primitive.to]);
        expect(style).toEqual([2, 0, primitive.width]);
      } else {
        expect(geometry).toEqual([...primitive.center, 0, 0]);
        expect(style).toEqual([
          primitive.kind === 'dot' ? 0 : 1,
          primitive.radius,
          primitive.kind === 'ring' ? primitive.width : 0,
        ]);
      }
    }
    setReticleUniforms(pass, frame);
    expect(pass.uniforms.uReticleCount!.value).toBe(0);
    pass.dispose();
  });
});
