import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { blockColors, buildRegistry, requiredSoundIssues, validateContent } from '../src/core/content.ts';

const BASE = 'src/content/base';
const base = readdirSync(BASE)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => ({ source: f, data: JSON.parse(readFileSync(join(BASE, f), 'utf8')) as unknown }));

describe('content', () => {
  it('base content has no issues', () => {
    const { registry, issues } = buildRegistry(base);
    expect(issues).toEqual([]);
    expect(registry.blocks[0]!.id).toBe('air');
    for (const id of ['grass', 'dirt', 'stone', 'sand']) {
      expect(registry.blockIds.has(id)).toBe(true);
    }
  });

  it('keeps footstep audio in the body mix without a second hearing-noise path', () => {
    const { registry } = buildRegistry(base);
    for (const id of [
      'footstep_grass',
      'footstep_mud',
      'footstep_sand',
      'footstep_stone',
      'footstep_wood',
      'footstep_leaves',
    ]) {
      const sound = registry.sounds.get(id)!;
      expect(sound.category, id).toBe('body');
      expect(sound.noise.enabled, id).toBe(false);
    }
  });

  it('validates the shambler search-duration range', () => {
    const zombiePack = base.find(({ source }) => source === 'zombies.json')!;
    const data = structuredClone(zombiePack.data) as {
      zombies: Array<{ hearingModel: { searchSeconds: { min: number; max: number } } }>;
    };
    data.zombies[0]!.hearingModel.searchSeconds = { min: 51, max: 50 };
    const issues = validateContent({ source: zombiePack.source, data });
    expect(issues.map(({ message }) => message)).toContain('minimum search duration must not exceed maximum');
  });

  it('fails when the sounds.json content file is missing required events', () => {
    const { registry } = buildRegistry(base.filter(({ source }) => source !== 'sounds.json'));
    const missingLight = requiredSoundIssues(registry).some(
      (issue) => issue.message === 'missing required sound event "player_hurt_light"',
    );
    expect(missingLight).toBe(true);
  });

  it('requires the blocked door-close sound event', () => {
    const { registry } = buildRegistry(base.filter(({ source }) => source !== 'sounds.json'));
    expect(requiredSoundIssues(registry).map((issue) => issue.message)).toContain(
      'missing required sound event "door_blocked_close"',
    );
  });

  it('fails when a required sound event has no definition', () => {
    const sounds = {
      source: 'sounds.json',
      data: {
        sounds: [
          {
            id: 'player_hurt_light',
            variants: ['assets/audio/player-hurt-light-01.ogg'],
            gain: 0.8,
            pitchJitter: [0.95, 1.05],
            gainJitter: [0.9, 1.1],
            minIntervalSeconds: 0.1,
            category: 'body',
            noise: { enabled: true, radiusMetres: 8 },
          },
        ],
      },
    };
    const { registry } = buildRegistry([...base.filter(({ source }) => source !== 'sounds.json'), sounds]);
    const missingHeavy = requiredSoundIssues(registry).some(
      (issue) => issue.message === 'missing required sound event "player_hurt_heavy"',
    );
    expect(missingHeavy).toBe(true);
  });

  it('lets a later file override a block without changing its runtime id', () => {
    const mod = {
      source: 'mod.json',
      data: { blocks: [{ id: 'grass', name: 'Dead grass', color: '#8a7a40', solid: true }] },
    };
    const before = buildRegistry(base).registry;
    const after = buildRegistry([...base, mod]).registry;
    expect(after.blockIds.get('grass')).toBe(before.blockIds.get('grass'));
    expect(after.blocks[after.blockIds.get('grass')!]!.name).toBe('Dead grass');
    expect(after.blocks.length).toBe(before.blocks.length);
  });

  it('reports mistakes and skips the broken file whole', () => {
    const bad = {
      source: 'bad.json',
      data: {
        blocks: [
          { id: 'Rock', name: 'Rock', color: 'grey', solid: true, hardnes: 3 },
          { id: 'ok', name: 'Fine', color: '#ffffff', solid: true },
          { id: 'ok', name: 'Again', color: '#ffffff', solid: true },
        ],
        items: [{ id: 'x', name: 'X', category: 'misc', weight: -1 }],
        lewt: [],
      },
    };
    const { registry, issues } = buildRegistry([...base, bad]);
    expect(issues.map((i) => i.path).sort()).toEqual([
      'blocks[0].color',
      'blocks[0].hardnes',
      'blocks[0].id',
      'items[0].size',
      'items[0].weight',
      'lewt',
    ]);
    expect(registry.blockIds.has('ok')).toBe(false);
  });

  it('requires sightCone on every zombie type', () => {
    const missingCone = {
      source: 'missing-cone.json',
      data: {
        zombies: [
          {
            id: 'missing_cone',
            name: 'Missing cone',
            regions: { head: 50, torso: 50, leftArm: 20, rightArm: 20, leftLeg: 20, rightLeg: 20 },
            speed: { wander: 0.8, chase: 2.5 },
            stepLength: 0.6,
            sight: 20,
            nightSight: 10,
            hearing: 1,
            hearingRange: { walk: 3, jog: 8, sprint: 15 },
            attack: { damage: 5, reach: 1, cooldown: 1.5 },
            abilities: [],
            model: 'figure_basic',
          },
        ],
      },
    };
    expect(buildRegistry([...base, missingCone]).issues.map((issue) => issue.path)).toContain('zombies[0].sightCone');
  });

  it('requires stepLength on every zombie type', () => {
    const missingStepLength = {
      source: 'missing-step-length.json',
      data: {
        zombies: [
          {
            id: 'missing_step_length',
            name: 'Missing step length',
            regions: { head: 50, torso: 50, leftArm: 20, rightArm: 20, leftLeg: 20, rightLeg: 20 },
            speed: { wander: 0.8, chase: 2.5 },
            sight: 20,
            nightSight: 10,
            sightCone: 60,
            hearing: 1,
            hearingRange: { walk: 3, jog: 8, sprint: 15 },
            attack: { damage: 5, reach: 1, cooldown: 1.5 },
            abilities: [],
            model: 'figure_basic',
          },
        ],
      },
    };
    expect(buildRegistry([...base, missingStepLength]).issues.map((issue) => issue.path)).toContain(
      'zombies[0].stepLength',
    );
  });

  it('reports a duplicate id within a file', () => {
    const block = { id: 'ok', name: 'Fine', color: '#ffffff', solid: true };
    const issues = validateContent({ source: 'dup.json', data: { blocks: [block, block] } });
    expect(issues).toEqual([{ source: 'dup.json', path: 'blocks[1].id', message: 'duplicate id "ok" in this file' }]);
  });

  it('has every kind of content in the base pack', () => {
    const { registry } = buildRegistry(base);
    expect(registry.items.size).toBeGreaterThan(30);
    for (const map of [registry.furniture, registry.figures, registry.loot, registry.templates, registry.zombies]) {
      expect(map.size).toBeGreaterThan(0);
    }
    expect(registry.figures.get('player')?.palette).toEqual({ skin: '#c58f70', shirt: '#52677d', trousers: '#4a4b55' });
  });
});

describe('content references', () => {
  const fixture = {
    source: 'broken-reference.json',
    data: JSON.parse(readFileSync('test/fixtures/content/broken-reference.json', 'utf8')) as unknown,
  };
  const withBase = (...extra: { source: string; data: unknown }[]) => buildRegistry([...base, ...extra]);
  const paths = (issues: { path: string }[]) => issues.map((i) => i.path);

  it('reports a loot entry for a missing item, and drops the whole file', () => {
    const { registry, issues } = withBase(fixture);
    expect(issues).toEqual([
      { source: 'broken-reference.json', path: 'loot[0].entries[1].item', message: 'no item "golden_toilet"' },
    ]);
    expect(registry.items.has('fixture_trinket')).toBe(false);
    expect(registry.loot.has('fixture_drawer')).toBe(false);
  });

  it('drops files that relied on a dropped file', () => {
    const uses = {
      source: 'uses.json',
      data: { loot: [{ id: 'more', rolls: [1, 1], entries: [{ table: 'fixture_drawer', weight: 1 }] }] },
    };
    const { registry, issues } = withBase(fixture, uses);
    expect(issues.map((i) => i.source)).toEqual(['broken-reference.json', 'uses.json']);
    expect(registry.loot.has('more')).toBe(false);
    expect(registry.loot.has('kitchen_cupboard')).toBe(true);
  });

  it('finds nested loot tables that loop', () => {
    const loop = {
      source: 'loop.json',
      data: {
        loot: [
          { id: 'a', rolls: [1, 1], entries: [{ table: 'b', weight: 1 }] },
          { id: 'b', rolls: [1, 1], entries: [{ table: 'a', weight: 1 }] },
        ],
      },
    };
    const { issues } = withBase(loop);
    expect(issues.map((i) => i.message)).toContain('nested tables loop: a → b → a');
  });

  it('checks furniture, zombie and light references', () => {
    const mod = {
      source: 'mod.json',
      data: {
        furniture: [{ id: 'safe', name: 'Safe', size: [1, 1, 1], color: '#333333', loot: 'vault' }],
        zombies: [
          {
            id: 'clerk',
            name: 'Clerk',
            regions: { head: 50, torso: 50, leftArm: 20, rightArm: 20, leftLeg: 20, rightLeg: 20 },
            speed: { wander: 0.8, chase: 2.5 },
            stepLength: 0.6,
            wander: {
              idleSeconds: { min: 3, max: 10 },
              strollSeconds: { min: 3, max: 12 },
              leashMetres: 12,
              lookIntervalSeconds: { min: 0.8, max: 1.8 },
              bodyLookArcDegrees: 150,
              headLookArcDegrees: 100,
              bodyTurnDegreesPerSecond: 90,
              headTurnDegreesPerSecond: 120,
              movementAcceleration: 4,
            },
            sight: 20,
            nightSight: 10,
            sightCone: 60,
            hearing: 1,
            hearingRange: { walk: 3, jog: 8, sprint: 15 },
            hearingModel: {
              farMultiplier: 2,
              bearingErrorRadians: 0.61,
              investigationDistanceMetres: 8,
              wallRunCostMetres: 6,
              searchSeconds: { min: 40, max: 50 },
              searchRadiusMetres: 4,
              searchStrollSeconds: { min: 1, max: 3 },
            },
            chaseMotion: {
              swayDegrees: 25,
              swayIntervalSeconds: { min: 0.7, max: 1.1 },
              speedMultiplier: { min: 0.6, max: 1.2 },
              lurchSeconds: 1,
              stumbleChancePerSecond: 0.16,
              stumbleDurationSeconds: { min: 0.55, max: 0.75 },
              stumbleEaseSeconds: 0.2,
              stumbleSpeedFraction: 0.04,
              stumbleDeceleration: 14,
            },
            attack: { damage: 5, reach: 1, cooldown: 1.5 },
            abilities: [],
            loot: 'till',
            model: 'figure_basic',
          },
        ],
        items: [
          {
            id: 'torch_lamp',
            name: 'Lamp',
            category: 'light',
            weight: 300,
            size: [1, 2],
            light: { radius: 5, seenFrom: 30, power: { battery: 'bandage', perHour: 1 } },
          },
        ],
      },
    };
    expect(paths(withBase(mod).issues).sort()).toEqual([
      'furniture[0].loot',
      'furniture[0].loot',
      'items[0].light.power.battery',
      'zombies[0].loot',
    ]);
  });
});

describe('templates', () => {
  const template = (layers: string[][], palette: Record<string, unknown>, size = [3, layers.length, 2]) => ({
    source: 'tpl.json',
    data: { templates: [{ id: 'hut', size, palette, layers }] },
  });
  const check = (t: { source: string; data: unknown }) =>
    buildRegistry([...base, t]).issues.map((i) => `${i.path}: ${i.message}`);

  it('accepts a well-formed template', () => {
    const t = template(
      [
        ['###', '#.#'],
        ['#D#', '#.#'],
      ],
      { '#': 'brick', '.': 'air', D: { furniture: 'fixture_door' } },
    );
    const doors = {
      source: 'doors.json',
      data: {
        furniture: [{ id: 'fixture_door', name: 'Door', size: [1, 1, 1], color: '#7a5534', door: { handling: 0.5 } }],
      },
    };
    expect(buildRegistry([...base, doors, t]).issues).toEqual([]);
  });

  it('checks layer sizes and that characters are in the palette', () => {
    expect(check(template([['###', '#?#'], ['##']], { '#': 'brick' }))).toEqual([
      'templates[0].layers[0][1]: "?" is not in the palette',
      'templates[0].layers[1]: has 1 rows; size[2] is 2',
      'templates[0].layers[1][0]: has 2 cells; size[0] is 3',
    ]);
  });

  it('checks palette references', () => {
    const t = template([['abc', 'abc']], {
      a: 'unobtainium',
      b: { spawn: 'ghost' },
      c: { furniture: 'throne', loot: 'hoard' },
    });
    expect(check(t)).toEqual([
      'templates[0].palette["a"]: no block "unobtainium"',
      'templates[0].palette["b"].spawn: no zombie type "ghost"',
      'templates[0].palette["c"].furniture: no furniture "throne"',
      'templates[0].palette["c"].loot: no loot table "hoard"',
    ]);
  });

  it('needs every furniture mark to belong to a whole piece', () => {
    // A 2-wide crate marked on one cell only.
    const t = template([['C..', '...']], { C: { furniture: 'crate' }, '.': 'air' }, [3, 1, 2]);
    expect(check(t)).toEqual([
      'templates[0].palette["C"].furniture: the piece at [0, 0, 0] needs 2 × 2 × 2 cells marked "C"',
    ]);
  });

  it('explains a bad palette entry', () => {
    const t = template([['a']], { a: { furniture: 'crate', chance: 2 } }, [1, 1, 1]);
    expect(check(t)).toEqual([
      'templates[0].palette["a"].chance: must be 0 to 1',
      'templates[0].palette["a"]: "chance" only goes with "spawn"',
    ]);
  });
});

describe('content', () => {
  it('turns block colours into bytes', () => {
    const { registry } = buildRegistry([
      { source: 'a', data: { blocks: [{ id: 'r', name: 'R', color: '#ff8001', solid: true }] } },
    ]);
    expect([...blockColors(registry)]).toEqual([0, 0, 0, 255, 128, 1]);
  });
});
