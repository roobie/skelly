import { describe, expect, it } from 'vitest';
import { claimed, claimedId } from '../src/core/capabilities.ts';
import { buildRegistry, requiredContentIssues, validateContent } from '../src/core/content.ts';
import { worldGravity } from '../src/core/gravity.ts';
import { resolveWeatheringUrl } from '../src/core/weatheringUrl.ts';
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

  it('runtime gravity and default weathering use independently named providers', () => {
    const registry = baseRegistry();
    const player = claimed(registry.player, 'player')!;
    const weathering = claimed(registry.weathering, 'defaultWeathering')!;
    registry.player = new Map([['fixture_player_tuning', { ...player, id: 'fixture_player_tuning' }]]);
    registry.weathering = new Map([['fixture_neutral_surface', { ...weathering, id: 'fixture_neutral_surface' }]]);
    expect(worldGravity(registry)).toBe(player.gravityMetresPerSimSecondSquared);
    const resolved = resolveWeatheringUrl(new URLSearchParams(), registry.weathering);
    expect(resolved?.profileId).toBe('fixture_neutral_surface');
    expect(resolved?.settings.strength).toBe(weathering.strength);
  });
});
