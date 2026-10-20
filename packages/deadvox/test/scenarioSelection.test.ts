import { expect, it } from 'vitest';
import { SECONDS_PER_HOUR } from '../src/core/clock.ts';
import { buildRegistry } from '../src/core/content.ts';
import { makeScale } from '../src/core/scale.ts';
import { World } from '../src/core/world.ts';
import { createSession, IDLE } from '../src/game/session.ts';
import { fixtureScenario, fixtureScenarioSources } from './fixtures/scenario.ts';
import { content as BUNDLED_CONTENT, siteFromUrl } from './fixtures/startupContent.ts';

it('selects only admitted scenario ids from the URL', () => {
  const profile = fixtureScenario();
  const sources = fixtureScenarioSources(profile);
  const admitted = buildRegistry(sources);
  expect(admitted.issues).toEqual([]);
  const params = new URLSearchParams({ site: profile.id });
  expect(siteFromUrl(params, 'hamlet', admitted.registry).site).toBe(profile.id);
  const data = sources[0]!.data as { scenarios: (typeof profile)[] };
  data.scenarios[0]!.body = 'missing_fixture_body';
  const rejected = buildRegistry(sources);
  expect(rejected.issues.length).toBeGreaterThan(0);
  expect(siteFromUrl(params, 'hamlet', rejected.registry).site).toBe('hamlet');
});

it('uses the selected scenario body and wait cap through the ordinary session owners', () => {
  const profile = fixtureScenario();
  const own = buildRegistry(fixtureScenarioSources(profile));
  expect(own.issues).toEqual([]);
  const registry = {
    ...BUNDLED_CONTENT.registry,
    body: new Map([...BUNDLED_CONTENT.registry.body, ...own.registry.body]),
    compression: new Map([...BUNDLED_CONTENT.registry.compression, ...own.registry.compression]),
  };
  const session = createSession({
    registry,
    scenario: profile,
    world: new World(),
    scale: makeScale(0.5),
    seed: 1,
    start: 43_200,
    spawn: [0, 10, 0],
    isSolid: () => false,
    isOpaque: () => false,
    ready: () => true,
    controls: {
      active: () => true,
      intent: () => IDLE,
      yaw: () => 0,
      pitch: () => 0,
      walking: () => false,
      descending: () => false,
    },
    audio: { play: () => undefined },
    notice: () => undefined,
    onRead: () => undefined,
  });
  expect(session.sim.body.fatigueRisePerGameHour).toBe(
    own.registry.body.get(profile.body)!.fatigueRisePerGameHour * SECONDS_PER_HOUR,
  );
  expect(session.sim.actions.startWait()).toBeUndefined();
  expect(session.sim.compression.limits.cap).toBe(own.registry.compression.get(profile.compression)!.caps.wait);
});
