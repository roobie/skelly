import { buildRegistry, type Registry, requiredContentIssues } from '@skelly/engine/content';
import { validateContent } from '@skelly/engine/internal/core/content.ts';
import { resolveWeatheringUrl } from '@skelly/engine/internal/core/weatheringUrl.ts';
import { claimed, claimedId } from '@skelly/engine/inventory';
import { worldGravity } from '@skelly/engine/sim';
import { siteGenerationOf } from '@skelly/engine/world';
import { describe, expect, it } from 'vitest';
import { baseRegistry } from './baseRegistry.ts';

const compression = (id: string) => ({
  id,
  capability: 'player',
  caps: { wait: 1, rest: 1, sleep: 1, craft: 1, reading: 1, treatment: 1 },
});

describe('content capabilities', () => {
  it('selects a claimant by its capability rather than its id', () => {
    const { registry, issues } = buildRegistry([
      { source: 'fixture', data: { compression: [compression('alternative')] } },
    ]);
    expect(issues).toEqual([]);
    expect(claimedId(registry.compression, 'player')).toBe('alternative');
    expect(claimed(registry.compression, 'player')?.caps).toEqual(compression('alternative').caps);
  });

  it('names the missing capability even when an unclaimed entry exists', () => {
    const { registry, issues } = buildRegistry([
      { source: 'fixture', data: { compression: [{ ...compression('unclaimed'), capability: undefined }] } },
    ]);
    expect(issues).toEqual([]);
    expect(requiredContentIssues(registry)).toContainEqual({
      source: 'core content',
      path: 'compression',
      message: 'missing required capability "player"',
    });
    expect(() => claimedId(registry.compression, 'player')).toThrow('missing required capability "player"');
  });

  describe('power tuning', () => {
    const device = { id: 'fixture_load', kind: 'consumer', priority: 0, demandWatts: 1 };
    const tuningIssues = (data: unknown) => {
      const { registry, issues } = buildRegistry([{ source: 'fixture', data }]);
      return [...issues, ...requiredContentIssues(registry).filter(({ path }) => path === 'powerTuning')];
    };

    it('owes nothing in a stack with no power device', () => {
      expect(tuningIssues({})).toEqual([]);
    });

    it('fails a stack whose power device has no tuning, and passes once tuning loads', () => {
      expect(tuningIssues({ powerDevices: [device] })).toEqual([
        { source: 'core content', path: 'powerTuning', message: 'missing required capability "power"' },
      ]);
      expect(
        tuningIssues({
          powerDevices: [device],
          powerTuning: [{ id: 'fixture_tuning', capability: 'power', tickSimSeconds: 1 }],
        }),
      ).toEqual([]);
    });
  });

  describe('site generation', () => {
    const empty = new Map();
    const siteIssues = (registry: Registry) =>
      requiredContentIssues(registry).filter(({ path }) => path === 'siteGeneration');

    it('owes nothing in a stack that builds no site', () => {
      expect(siteIssues(buildRegistry([]).registry)).toEqual([]);
      expect(
        siteIssues({ ...baseRegistry(), siteGeneration: empty, starts: empty, layouts: empty, scenarios: empty }),
      ).toEqual([]);
    });

    it('fails a stack whose start, layout or scenario builds a site without the row', () => {
      const base = baseRegistry();
      const siteRows = { starts: base.starts, layouts: base.layouts, scenarios: base.scenarios };
      for (const [section, rows] of Object.entries(siteRows)) {
        expect(rows.size, section).toBeGreaterThan(0);
        const registry = {
          ...base,
          siteGeneration: empty,
          starts: empty,
          layouts: empty,
          scenarios: empty,
          [section]: rows,
        } as Registry;
        expect(siteIssues(registry), section).toEqual([
          { source: 'core content', path: 'siteGeneration', message: 'missing required capability "authoredSite"' },
        ]);
        expect(() => siteGenerationOf(registry)).toThrow('Missing site generation content');
      }
      expect(siteIssues(base)).toEqual([]);
    });
  });

  it('refuses competing one-provider claims instead of choosing by load order', () => {
    const providers = [compression('first'), compression('second')];
    for (const rows of [providers, [...providers].reverse()]) {
      const { issues } = buildRegistry([{ source: 'fixture', data: { compression: rows } }]);
      expect(issues).toHaveLength(1);
      expect(issues[0]?.path).toBe('compression');
      expect(issues[0]?.message).toContain('competing claimants for capability "player"');
      for (const { id } of providers) {
        expect(issues[0]?.message).toContain(id);
      }
    }
  });

  it('rejects a claim without its required payload and an unsupported claim', () => {
    for (const entry of [
      { id: 'incomplete', capability: 'player' },
      { ...compression('unsupported'), capability: 'flight' },
    ]) {
      expect(validateContent({ source: 'fixture', data: { compression: [entry] } }).length).toBeGreaterThan(0);
    }
  });

  it('rejects non-kind weapon class ids without restricting the unarmed provider id', () => {
    const tuning = {
      pose: 'blunt',
      damageVariance: 0,
      headDamageMultiplier: 1,
      limbDamageMultiplier: 1,
      speedMultiplier: 1,
    };
    const kind = { id: 'fixture_melee_kind', class: 'melee' };
    const sound = [...baseRegistry().sounds.values()][0]!;
    const validate = (entry: unknown) =>
      buildRegistry([
        {
          source: 'fixture',
          data: {
            damageKinds: [kind],
            meleeClasses: [entry],
            sounds: ['fixture_swing', 'fixture_hit'].map((id) => ({ ...sound, id })),
          },
        },
      ]).issues;
    expect(validate({ ...tuning, id: kind.id })).toEqual([]);
    expect(
      validate({
        ...tuning,
        id: 'fixture_unarmed',
        capability: 'unarmed',
        pose: 'fists',
        unarmed: {
          damageKind: kind.id,
          swingSound: 'fixture_swing',
          hitSound: 'fixture_hit',
          motion: 'thrust',
          damage: 1,
          reach: 1,
          cooldownSimSeconds: 1,
          stamina: 0,
          contactFraction: 0.5,
          windupCapSimSeconds: 1,
          impulse: 0,
        },
      }),
    ).toEqual([]);
    expect(validate({ ...tuning, id: 'fixture_mistyped_kind' }).length).toBeGreaterThan(0);
  });

  it('runtime gravity and default weathering use independently named providers', () => {
    const base = baseRegistry();
    const player = claimed(base.player, 'player')!;
    const weathering = claimed(base.weathering, 'defaultWeathering')!;
    const { registry, issues } = buildRegistry([
      {
        source: 'alternative',
        data: {
          damageKinds: [base.damageKinds.get(player.debugBlockTool.damageKind)!],
          player: [{ ...player, id: 'fixture_player_tuning' }],
          weathering: [{ ...weathering, id: 'fixture_neutral_surface' }],
        },
      },
    ]);
    expect(issues).toEqual([]);
    expect(worldGravity(registry)).toBe(player.gravityMetresPerSimSecondSquared);
    const resolved = resolveWeatheringUrl({}, registry.weathering);
    expect(resolved?.profileId).toBe('fixture_neutral_surface');
    expect(resolved?.settings.strength).toBe(weathering.strength);
  });
});
