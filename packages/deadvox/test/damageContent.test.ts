import { expect, it } from 'vitest';
import { bashBlock } from '../src/core/blockDamage.ts';
import { BODY_REGIONS, Body, type BodyRegion } from '../src/core/body.ts';
import { claimed } from '../src/core/capabilities.ts';
import { buildRegistry } from '../src/core/content.ts';
import { damageToActor } from '../src/core/zombies.ts';
import { baseSources } from '../src/game/bundledContent.ts';
import { meleeProfileForWeapon } from '../src/game/melee.ts';
import { baseRegistry } from './baseRegistry.ts';
import { bodyWithFixtureKind, fixtureDamageContent } from './fixtures/damageKinds.ts';

it('uses a content-only damage kind on bodies, actors and terrain with an existing class and pose', () => {
  const base = baseRegistry();
  const kind = 'fixture_sonic';
  const templateClass = [...base.meleeClasses.values()].find((entry) => !entry.unarmed)!;
  const templateActor = claimed(base.zombies, 'settlementWanderer')!;
  const templateWeapon = [...base.items.values()].find((entry) => entry.weapon?.melee)!;
  const tuning = {
    ...bodyWithFixtureKind(claimed(base.body, 'player')!, kind),
    id: 'fixture_response',
    capability: undefined,
  };
  const actor = {
    ...templateActor,
    id: 'fixture_sonic_actor',
    capability: undefined,
    attack: {
      ...templateActor.attack,
      moves: templateActor.attack.moves.map((move) => ({ ...move, damageKind: kind })),
    },
    damageResistance: {
      [kind]: Object.fromEntries(BODY_REGIONS.map((region) => [region, 0.5])) as Record<BodyRegion, number>,
    },
  };
  const item = {
    ...templateWeapon,
    id: 'fixture_sonic_weapon',
    name: 'Fixture resonator',
    weapon: { ...templateWeapon.weapon, melee: { ...templateWeapon.weapon!.melee!, type: kind } },
  };
  const { registry, issues } = buildRegistry([
    ...baseSources,
    {
      source: 'fixture-kind',
      data: {
        damageKinds: [{ id: kind, class: 'melee' }],
        meleeClasses: [{ ...templateClass, id: kind }],
        actors: [actor],
        items: [item],
        body: [...base.body.values()].map((entry) => bodyWithFixtureKind(entry, kind)).concat(tuning),
        blockMaterials: [...base.blockMaterials.values()].map((entry) => ({
          ...entry,
          resistance: { ...entry.resistance, [kind]: 0.5 },
        })),
      },
    },
  ]);
  expect(issues).toEqual([]);
  const selected = registry.items.get(item.id)!.weapon!.melee!.type;
  expect(meleeProfileForWeapon(registry.meleeClasses, selected)).toBe(templateClass.pose);
  const body = new Body(registry.body.get(tuning.id)!);
  body.impact(4, 'torso', { kind: selected });
  expect(body.health).toBeLessThan(100);
  expect(body.shock).toBeLessThan(100);
  expect(damageToActor(registry.zombies.get(actor.id)!, 4, selected, 'torso')).toBe(2);
  const material = [...registry.blockMaterials.values()][0]!;
  expect(bashBlock({ material: { ...material, minimumStrength: 0 }, damage: 0 }, { kind, strength: 4 }).damage).toBe(2);
});

it('gives every bundled actor an explicit resistance for every declared kind and body region', () => {
  const registry = baseRegistry();
  expect(registry.damageKinds.size).toBeGreaterThan(0);
  expect(registry.zombies.size).toBeGreaterThan(0);
  for (const actor of registry.zombies.values()) {
    for (const kind of registry.damageKinds.keys()) {
      for (const region of BODY_REGIONS) {
        expect(Object.hasOwn(actor.damageResistance?.[kind] ?? {}, region), `${actor.id}: ${kind}.${region}`).toBe(
          true,
        );
      }
    }
  }
});

it('rejects a declared kind missing from every body response rather than accepting an unusable pair', () => {
  const kind = 'fixture_missing_body_response';
  const base = baseRegistry();
  const { issues } = buildRegistry([
    {
      source: 'fixture-missing-response',
      data: {
        damageKinds: [...base.damageKinds.values(), { id: kind, class: 'non-melee' }],
        body: [...base.body.values()],
        sounds: [...base.sounds.values()],
      },
    },
  ]);
  expect(issues.some(({ path }) => path.endsWith(`.shockPerDamage.${kind}`))).toBe(true);
});

it.each([undefined, 'non-melee'] as const)('rejects a weapon class without a declared melee kind (%s)', (kindClass) => {
  const id = 'fixture_weapon_kind';
  const { issues } = buildRegistry([
    {
      source: 'fixture-invalid-class',
      data: {
        damageKinds: kindClass ? [{ id, class: kindClass }] : [],
        meleeClasses: [{ ...fixtureDamageContent().meleeClasses[0]!, id }],
      },
    },
  ]);
  expect(issues.some(({ path }) => path === 'meleeClasses[0].id')).toBe(true);
});

it('rejects a partial body response domain instead of borrowing missing tuning', () => {
  const kind = 'fixture_partial_response';
  const base = baseRegistry();
  const body = bodyWithFixtureKind(claimed(base.body, 'player')!, kind);
  delete body.outerWearMultiplier[kind];
  const { issues } = buildRegistry([
    {
      source: 'fixture-partial-response',
      data: {
        damageKinds: [...base.damageKinds.values(), { id: kind, class: 'non-melee' }],
        body: [body],
        sounds: [...base.sounds.values()],
      },
    },
  ]);
  expect(
    issues.some(
      ({ path, source }) => source === 'fixture-partial-response' && path === `body[0].outerWearMultiplier.${kind}`,
    ),
  ).toBe(true);
});
