import { afterEach, expect, it, vi } from 'vitest';
import { AuthoredSite } from '../src/core/authoredSite.ts';
import type { Vec3 } from '../src/core/coords.ts';
import { graphicsTuningOf } from '../src/core/graphicsTuning.ts';
import { makeScale } from '../src/core/scale.ts';
import { authoredSkyBoxes, SkyFields } from '../src/core/skyField.ts';
import { createEngine } from '../src/game/engine.ts';
import { fixtureBox, skyWorldFixture } from './fixtures/skyWorld.ts';
import { configFromUrl } from './fixtures/startupContent.ts';

const owner = vi.hoisted(() => ({ setup: undefined as unknown }));
vi.mock('../src/game/worldSetup.ts', () => ({ createWorldSetup: () => owner.setup }));
afterEach(() => vi.unstubAllGlobals());

it('draws the shared cache for an above-ground authored placement without an indoor flag', () => {
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
  const skyFields = new SkyFields(fixture, { bottom: 0, top: 31 }, authoredSkyBoxes(site.placements));
  owner.setup = {
    world: fixture.world,
    entities: fixture.entities,
    registry: fixture.registry,
    skyFields,
    site,
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
  const room: Vec3 = [8.5, 4.5, 8.5];
  const metres = room.map((value) => value * scale.blockSize) as Vec3;
  expect(engine.skylight!.at(metres)).toBeLessThanOrEqual(graphicsTuningOf(fixture.registry).unbuiltSkyCap);
  expect(skyFields.visibilityAt(room)).toBe(0);
  engine.skylight!.update(engine.scene, room);
  expect(engine.skylight!.at(metres)).toBe(0);
});
