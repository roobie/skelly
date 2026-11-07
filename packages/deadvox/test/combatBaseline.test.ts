import { expect, it } from 'vitest';
import { claimed } from '../src/core/capabilities.ts';
import { firearmsSkillEffects } from '../src/core/firearmsSkill.ts';
import { handlingWeights } from '../src/core/inventory.ts';
import { firearmsCombatTuning, meleeCombatTuning } from '../src/core/skillTraining.ts';
import { baseRegistry } from './baseRegistry.ts';
import { withoutCombatSkills } from './fixtures/withoutCombatSkills.ts';
import { advance, createRuntime } from './snapshotTestSupport.ts';

it('resolves firearm baselines, mechanism tuning and expert endpoints from their own providers', () => {
  const registry = baseRegistry();
  const policy = claimed(registry.combatPolicy, 'player')!.firearms!;
  const ranged = claimed(registry.rangedTuning, 'ranged')!;
  const skill = claimed(registry.skills, 'firearmsCombat')!;
  const tuning = firearmsCombatTuning(registry);
  expect(tuning).not.toHaveProperty('id');
  expect(tuning).not.toHaveProperty('capability');
  expect(tuning.skillZeroHandling).toBe(policy.skillZeroHandling);
  expect(tuning.caseEjection).toBe(ranged.caseEjection);
  expect(tuning.shotTraceRangeBlocks).toBe(ranged.shotTraceRangeBlocks);
  expect(tuning.wobbleSkillTenVariance).toBe(skill.combat!.firearms!.wobbleSkillTenVariance);
  expect(tuning.breathHold).toMatchObject(policy.breathHold);
  expect(tuning.breathHold).toMatchObject(skill.combat!.firearms!.breathHold);
  expect(meleeCombatTuning(registry)).toMatchObject(claimed(registry.combatPolicy, 'player')!.melee!);
  expect(meleeCombatTuning(registry)).toMatchObject(claimed(registry.skills, 'meleeCombat')!.combat!.melee!);
});

it('starts and completes baseline inventory handling without combat or inventory skills', () => {
  const { registry, issues } = withoutCombatSkills();
  expect(issues).toEqual([]);
  expect(claimed(registry.skills, 'inventoryManagement')).toBeUndefined();
  expect(claimed(registry.skills, 'firearmsCombat')).toBeUndefined();
  expect(claimed(registry.skills, 'meleeCombat')).toBeUndefined();
  const tuning = firearmsCombatTuning(registry);
  const baseline = claimed(registry.combatPolicy, 'player')!.firearms!;
  const effects = firearmsSkillEffects(0, tuning);
  expect(effects).toEqual({
    variance: baseline.skillZeroHandling.singleShot.variance,
    recoilKickScale: baseline.skillZeroHandling.singleShot.recoilKickScale,
    recoilRecoveryRate: baseline.skillZeroHandling.singleShot.recoilRecoveryScale,
    reloadFactor: 1,
    rackFactor: 1,
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
