import { safeParse } from 'valibot';
import { describe, expect, it } from 'vitest';
import { type ActorLodPolicy, ActorLodPolicySchema, selectActorFar } from '../src/core/actorLod.ts';

const policy: ActorLodPolicy = {
  enabled: true,
  enterFarM: 10,
  returnNearM: 8,
  families: { fixture: { eligible: true, edgeLengthM: 1 } },
};
describe('actor LOD policy', () => {
  it('holds its tier through the hysteresis band and promotes magnification immediately', () => {
    const outside = policy.enterFarM * 2;
    const band = (policy.returnNearM + policy.enterFarM) / 2;
    expect(selectActorFar(undefined, outside, policy, false)).toBe(true);
    expect(selectActorFar(true, band, policy, false)).toBe(true);
    expect(selectActorFar(false, band, policy, false)).toBe(false);
    expect(selectActorFar(true, policy.returnNearM / 2, policy, false)).toBe(false);
    expect(selectActorFar(true, outside, policy, true)).toBe(false);
    expect(selectActorFar(true, outside, { ...policy, enabled: false }, false)).toBe(false);
  });
  it('validates open model-family policy and requires reasons for exemptions', () => {
    expect(safeParse(ActorLodPolicySchema, policy).success).toBe(true);
    for (const invalid of [
      { ...policy, returnNearM: policy.enterFarM },
      { ...policy, enterFarM: Number.NaN },
      { ...policy, families: { fixture: { eligible: true, edgeLengthM: 0 } } },
      { ...policy, families: { fixture: { eligible: false, reason: '' } } },
    ]) {
      expect(safeParse(ActorLodPolicySchema, invalid).success).toBe(false);
    }
  });
});
