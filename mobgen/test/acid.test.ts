import { describe, expect, it } from 'vitest';
import { generate, realize } from '../src/core/generate.ts';
import { consumableTemplate, type Genome } from '../src/core/template.ts';
import { materialOf } from '../src/core/voxelize.ts';
import { crowdTextureLayout, isSeveredInMask, packSeveredMask } from '../src/mob/crowd.ts';
import { HUMANOID_TEMPLATES, onHumanoidSkeleton, shambler } from '../src/mob/templates.ts';

const SEEDS = [1, 2, 3, 7, 11, 42];
const acid = consumableTemplate('acid');

const withParams = (genome: Genome, params: Readonly<Record<string, number>>): Genome => ({
  ...genome,
  params: { ...genome.params, ...params },
});

/** Owning bone ids of every voxel painted with `material`. */
const ownersOf = (realized: ReturnType<typeof realize>, material: string): ReadonlySet<string> => {
  const owners = new Set<string>();
  for (const [index, owner] of realized.voxels.owner.entries()) {
    if (owner !== 0 && materialOf(realized.voxels.color[index]!) === material) {
      owners.add(realized.body.bones[owner - 1]!.id);
    }
  }
  return owners;
};

describe('acid zombie body', () => {
  it.each(SEEDS)('validates as a connected, grounded, budgeted body for seed %i', (seed) => {
    const realized = realize(generate(acid, seed));
    expect(realized.report.ok, realized.report.issues.map((issue) => issue.message).join('; ')).toBe(true);
  });

  it('rides every consumer of the humanoid skeleton', () => {
    expect(onHumanoidSkeleton(acid)).toBe(true);
    expect(HUMANOID_TEMPLATES).toContain(acid);
  });

  it("keeps the humanoid's bone ids, each surviving the crowd sever-mask handoff", () => {
    const { bones } = realize(generate(acid, 1)).body;
    expect(bones.map((bone) => bone.id)).toEqual(realize(generate(shambler, 1)).body.bones.map((bone) => bone.id));
    const layout = crowdTextureLayout(bones.length, 1);
    const data = new Float32Array(layout.width * layout.height * 4);
    for (const index of bones.keys()) {
      packSeveredMask(data, layout, 0, [index]);
      for (let check = 0; check < bones.length; check++) {
        expect(isSeveredInMask(data, layout, 0, check)).toBe(check === index);
      }
    }
  });

  it('gives the sac to the chest and the drool to the jaw, so a severed head takes the drool', () => {
    // Blisters repaint skin on any bone, so they are off here to leave only the sac and the drool.
    const genome = withParams(generate(acid, 1), { blisterCover: 0 });
    expect(ownersOf(realize(withParams(genome, { droolLength: 0 })), 'acid')).toEqual(new Set(['chest']));
    expect(ownersOf(realize(withParams(genome, { droolLength: 1 })), 'acid')).toEqual(new Set(['chest', 'jaw']));
  });
});
