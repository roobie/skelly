import { afterEach, expect, it, vi } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { makeScale } from '../src/core/scale.ts';
import { createEngine } from '../src/game/engine.ts';
import { fixtureBox, skyWorldFixture } from './fixtures/skyWorld.ts';
import { configFromUrl } from './fixtures/startupContent.ts';

const owner = vi.hoisted(() => ({ setup: undefined as unknown }));
vi.mock('../src/game/worldSetup.ts', () => ({ createWorldSetup: () => owner.setup }));
afterEach(() => vi.unstubAllGlobals());

it.each(['layout', 'site contract'] as const)(
  'discovers an above-ground authored placement through %s without an indoor flag',
  (ownerKind) => {
    const fixture = skyWorldFixture();
    const scale = makeScale(0.5);
    const site = new AuthoredSite(1, fixture.registry, scale, {
      id: 'fixture_site',
      lootContext: { usage: ['Residential'], tier: 'Tier1' },
      bounds: { x0: 0, z0: 0, x1: 32, z1: 32 },
      ground: 0,
      terrain: [],
      woodlands: [],
      tracks: [],
      shamblers: [],
      player: { position: [8, 1, 8], bearing: 0 },
      buildings: [
        {
          template: 'fixture_shell',
          lootContext: { usage: ['Residential'], tier: 'Tier1' },
          position: fixtureBox.min.map((value) => value * scale.blockSize) as Vec3,
          rotation: 0,
          storeys: 1,
        },
      ],
    });
    owner.setup = {
      world: fixture.world,
      entities: fixture.entities,
      registry: fixture.registry,
      site: ownerKind === 'layout' ? site : { authoredPlacements: site.placements },
      streamer: { requestSky: () => false },
    };
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = vi.fn();
      },
    );
    const engine = createEngine(
      { ...configFromUrl(new URLSearchParams()), scale },
      { clientWidth: 1, clientHeight: 1 } as HTMLElement,
      undefined,
      { render: false },
    );
    expect(fixture.knownOpaque(8, fixtureBox.max[1] - 1, 8)).toBe(true);
    expect(fixture.knownOpaque(8, 4, 8)).toBe(false);
    const pending = engine.skylight?.at([8.5, 4.5, 8.5].map((value) => value * scale.blockSize) as Vec3) ?? 1;
    expect(pending).toBeGreaterThan(0);
    expect(pending).toBeLessThan(1);
  },
);
