import { skillsByRole } from '@skelly/engine/internal/core/character.ts';
import { firearmsSkillEffects } from '@skelly/engine/internal/core/firearmsSkill.ts';
import { handlingWeights } from '@skelly/engine/internal/core/inventory.ts';
import { SKILL_LEVEL_MAX } from '@skelly/engine/internal/core/skillLevels.ts';
import { meleeCombatTuning } from '@skelly/engine/internal/core/skillTraining.ts';
import { claimed } from '@skelly/engine/inventory';
import { firearmsCombatTuning } from '@skelly/engine/sim';
import { expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';
import { withoutCombatSkills } from './fixtures/withoutCombatSkills.ts';
import { advance, createRuntime } from './snapshotTestSupport.ts';

it('resolves firearm baselines, mechanism tuning and expert endpoints from their own providers', () => {
  const registry = baseRegistry();
  const policy = claimed(registry.combatPolicy, 'player')!.firearms!;
  const ranged = claimed(registry.rangedTuning, 'ranged')!;
  const tuning = firearmsCombatTuning(registry);
  expect(tuning).not.toHaveProperty('id');
  expect(tuning).not.toHaveProperty('capability');
  expect(tuning.skillZeroHandling).toBe(policy.skillZeroHandling);
  expect(tuning.caseEjection).toBe(ranged.caseEjection);
  expect(tuning.shotTraceRangeBlocks).toBe(ranged.shotTraceRangeBlocks);
  expect(tuning.breathHold).toMatchObject(policy.breathHold);
  expect(tuning.skills).toEqual(policy.skills);
  expect(tuning.longGunSkills).toEqual(policy.longGunSkills);
  expect(meleeCombatTuning(registry)).toMatchObject(claimed(registry.combatPolicy, 'player')!.melee!);
});

it('starts and completes baseline inventory handling without combat or inventory skills', () => {
  const { registry, issues } = withoutCombatSkills();
  expect(issues).toEqual([]);
  expect(claimed(registry.skills, 'inventoryManagement')).toBeUndefined();
  expect(claimed(registry.skills, 'firearmsCombat')).toBeUndefined();
  expect(claimed(registry.skills, 'meleeCombat')).toBeUndefined();
  const tuning = firearmsCombatTuning(registry);
  const baseline = claimed(registry.combatPolicy, 'player')!.firearms!;
  // Every remaining skill at expert level still handles at skill zero: a role with no provider feeds nothing.
  const experts = skillsByRole(
    registry,
    Object.fromEntries([...registry.skills.keys()].map((id) => [id, SKILL_LEVEL_MAX])),
  );
  const effects = firearmsSkillEffects(experts, tuning);
  expect(effects).toEqual({
    variance: baseline.skillZeroHandling.singleShot.variance,
    recoilKickScale: baseline.skillZeroHandling.singleShot.recoilKickScale,
    recoilRecoveryRate: baseline.skillZeroHandling.singleShot.recoilRecoveryScale,
    reloadFactor: 1,
    rackFactor: 1,
    breathSteadying: baseline.breathHold.steadyingMinimum,
  });
  const runtime = createRuntime(undefined, false, undefined, { registry });
  const { inventory, handling, session } = runtime;
  const backpack = inventory.hands.right!;
  expect(inventory.move(backpack, { kind: 'worn' }).ok).toBe(true);
  const item = inventory.create('rag');
  expect(inventory.add(item, { kind: 'hand', side: 'right' })).toBe(true);
  const initial = session.character.snapshotState();
  const result = handling.enqueue(item, { kind: 'pile', pos: runtime.player.body.pos });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.reason);
  }
  expect(result.job.duration).toBeGreaterThanOrEqual(handlingWeights(registry).groundSimSeconds);
  handling.tick(result.job.duration);
  advance(runtime, 1);
  expect(inventory.locate(item)?.kind).toBe('pile');
  expect(session.character.snapshotState()).toEqual(initial);
});
