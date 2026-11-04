import { describe, expect, it } from 'vitest';
import toolContent from '../mods/skelly.deadvox.residual/items-tools.json' with { type: 'json' };
import uiContent from '../mods/skelly.deadvox.residual/ui.json' with { type: 'json' };
import { buildFixtureRegistry as buildRegistry } from './economyFixtures.ts';
import { fixtureBodySounds } from './fixtures/bodySounds.ts';
import { BODY_TUNING_FIXTURE } from './simulationFixture.ts';

const event = 'fixture_selection';
const ui = { ...structuredClone(uiContent.ui[0]!), refusalSound: event };
const sound = {
  id: event,
  description: 'fixture selection',
  variants: ['assets/audio/fixture.ogg'],
  gain: 1,
  pitchJitter: [1, 1],
  gainJitter: [1, 1],
  minIntervalSimSeconds: 0,
  category: 'ui',
  noise: { enabled: false, radiusMetres: 1 },
};

const furniture = { id: 'fixture_furniture', name: 'Fixture', size: [1, 1, 1], color: '#666666' };
const unarmed = toolContent.meleeClasses.find((entry) => 'unarmed' in entry)!;
const selections = [
  {
    path: 'body[0].sounds.strain',
    data: {
      body: [{ ...BODY_TUNING_FIXTURE, id: 'fixture_body', sounds: { ...BODY_TUNING_FIXTURE.sounds, strain: event } }],
    },
    providers: fixtureBodySounds(BODY_TUNING_FIXTURE),
  },
  {
    path: 'meleeClasses[0].unarmed.hitSound',
    data: {
      meleeClasses: [{ ...unarmed, unarmed: { ...unarmed.unarmed!, swingSound: 'fixture_other', hitSound: event } }],
    },
  },
  {
    path: 'furniture[0].moveSounds.drag',
    data: { furniture: [{ ...furniture, moveSounds: { lift: 'fixture_other', drag: event } }] },
  },
  ...(['openSound', 'closeSound', 'blockedCloseSound'] as const).map((field) => ({
    path: `furniture[0].door.${field}`,
    data: { furniture: [{ ...furniture, door: { methods: {}, handlingSimSeconds: 0, [field]: event } }] },
  })),
];

describe('entry-selected sounds', () => {
  it.each(selections)('checks the provider at $path', ({ path, data, ...fixture }) => {
    const providers = [...('providers' in fixture ? fixture.providers : []), { ...sound, id: 'fixture_other' }];
    const entry = { source: 'entry', data };
    expect(buildRegistry([entry, { source: 'provider', data: { sounds: [...providers, sound] } }]).issues).toEqual([]);
    expect(buildRegistry([entry, { source: 'provider', data: { sounds: providers } }]).issues).toContainEqual({
      source: 'entry',
      path,
      message: `no sound event "${event}"`,
    });
  });

  it('admits an independently named sound supplied by another content source', () => {
    const { registry, issues } = buildRegistry([
      { source: 'entry', data: { ui: [ui] } },
      { source: 'provider', data: { sounds: [sound] } },
    ]);
    expect(issues).toEqual([]);
    expect(registry.ui.get(ui.id)?.refusalSound).toBe(event);
  });

  it('refuses an absent sound at the entry field selecting it', () => {
    const { issues } = buildRegistry([{ source: 'entry', data: { ui: [ui] } }]);
    expect(issues).toContainEqual({
      source: 'entry',
      path: 'ui[0].refusalSound',
      message: `no sound event "${event}"`,
    });
  });
});
