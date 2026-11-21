import { buildRegistry } from '@skelly/engine/content';
import { layoutBuildingSite, placementOf } from '@skelly/engine/internal/core/authoredPlacement.ts';
import { AuthoredSite } from '@skelly/engine/internal/core/authoredSite.ts';
import { composeLayout } from '@skelly/engine/internal/core/composeLayout.ts';
import { SiteLayoutSchema } from '@skelly/engine/internal/core/schema/layouts.ts';
import type { ComposedSiteDef } from '@skelly/engine/internal/core/schema/scenarios.ts';
import type { SiteLayoutDef } from '@skelly/engine/internal/core/schema.ts';
import { placedPort, portsMate } from '@skelly/engine/internal/core/templates.ts';
import { makeScale } from '@skelly/engine/world';
import { parse } from 'valibot';
import { expect, it } from 'vitest';
import { roadsLookSources } from './baseContentFiles.ts';
import { sweepGroup } from './sweeps.ts';

// The shipped roads look scenario and its road pack: its two compounds must arrive joined by one fulfilled
// road, whatever seed places them.
const load = () => {
  const { registry, issues } = buildRegistry(roadsLookSources());
  if (issues.length > 0) {
    throw new Error(`roads look did not load cleanly: ${JSON.stringify(issues)}`);
  }
  const scenario = registry.scenarios.get('roads_look') as ComposedSiteDef;
  if (!scenario) {
    throw new Error('roads look scenario missing');
  }
  return { registry, scenario };
};

const gateAt = (
  context: { registry: ReturnType<typeof buildRegistry>['registry']; seed: number; layout: SiteLayoutDef },
  index: number,
  id: string,
) => {
  const building = context.layout.buildings[index]!;
  const placement = placementOf(
    context.registry,
    building,
    context.layout.lootContext,
    layoutBuildingSite(context.seed, context.layout, index),
  );
  return placedPort(placement, placement.template.ports!.find((port) => port.id === id)!);
};

/** The link's findings on one seed: the parsed layout with its gates, transitions, mated pairs and drawn track. */
const joinedRoad = (
  registry: ReturnType<typeof buildRegistry>['registry'],
  scenario: ComposedSiteDef,
  seed: number,
) => {
  const { layout } = composeLayout(seed, registry, scenario);
  parse(SiteLayoutSchema, layout);
  const compounds = layout.buildings.filter((building) => building.template !== 'roads_corner');
  const transitions = layout.buildings.filter((building) => building.template === 'roads_corner');
  const placed = { registry, seed, layout };
  const gates = compounds.map((compound) => gateAt(placed, layout.buildings.indexOf(compound), 'gate'));
  const docked = transitions.map((transition) => gateAt(placed, layout.buildings.indexOf(transition), 'gate'));
  const [track] = layout.tracks;
  // Each order of the two compounds against the two transitions must mate one gate; the corner can be either.
  const [gateA, gateB] = gates;
  const [dockA, dockB] = docked;
  const mated =
    gates.length === 2 &&
    docked.length === 2 &&
    gateA !== undefined &&
    gateB !== undefined &&
    dockA !== undefined &&
    dockB !== undefined &&
    ((portsMate(gateA, dockA) && portsMate(gateB, dockB)) || (portsMate(gateA, dockB) && portsMate(gateB, dockA)));
  const mouth = (port: ReturnType<typeof gateAt>): [number, number] => [port.at[0] * 0.5, port.at[2] * 0.5];
  const points = track?.points ?? [];
  const [first] = points;
  const last = points.at(-1);
  const mouthsMatch =
    track !== undefined &&
    first !== undefined &&
    last !== undefined &&
    ((first.every((value, axis) => value === mouth(gates[0]!)[axis]) &&
      last.every((value, axis) => value === mouth(gates[1]!)[axis])) ||
      (first.every((value, axis) => value === mouth(gates[1]!)[axis]) &&
        last.every((value, axis) => value === mouth(gates[0]!)[axis])));
  // The corner really bends the track: some consecutive triple of points turns.
  const bends = points.some((point, index) => {
    const a = points[index - 1];
    const b = points[index + 1];
    if (!(a && b)) {
      return false;
    }
    return (point[0] - a[0]) * (b[1] - point[1]) - (point[1] - a[1]) * (b[0] - point[0]) !== 0;
  });
  return {
    layout,
    compoundCount: compounds.length,
    transitions,
    mated,
    track,
    mouthsMatch,
    bends,
    profile: gates[0] ? registry.roadProfiles.get(gates[0].type) : undefined,
    startGate: gates[0],
  };
};

it('composes the shipped roads look with its link fulfilled and its ground loadable', () => {
  const { registry, scenario } = load();
  const joined = joinedRoad(registry, scenario, 1);
  expect(joined.compoundCount).toBe(2);
  expect(joined.transitions).toHaveLength(2);
  expect(joined.mated).toBe(true);
  // The track's width and surface come from the shipped profile, not literals.
  expect(joined.profile?.widthMetres).toBeDefined();
  expect(joined.track?.width).toBe(joined.profile?.widthMetres);
  expect(joined.track?.surface).toBe(joined.profile?.surface);
  expect(joined.mouthsMatch).toBe(true);
  expect(joined.bends).toBe(true);
  // The start stands just outside its compound's gate, facing along the road.
  const gate = joined.startGate!;
  const normal = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[gate.facing as 'n' | 'e' | 's' | 'w']!;
  expect(joined.layout.player.position).toEqual([
    (gate.at[0] + normal[0]!) * 0.5,
    gate.at[1] * 0.5,
    (gate.at[2] + normal[1]!) * 0.5,
  ]);
  expect(joined.layout.player.bearing).toBe({ n: 0, e: 90, s: 180, w: 270 }[gate.facing as 'n' | 'e' | 's' | 'w']);
  const site = new AuthoredSite(1, registry, makeScale(0.5), joined.layout);
  expect(site.authoredPlacements).toHaveLength(joined.layout.buildings.length);
});

sweepGroup('roads links across seeds', () => {
  it('keeps every seed joined, bending and really rotating', () => {
    const { registry, scenario } = load();
    const rotations = new Set<number>();
    for (let seed = 2; seed < 202; seed++) {
      const joined = joinedRoad(registry, scenario, seed);
      expect(joined.compoundCount).toBe(2);
      expect(joined.transitions).toHaveLength(2);
      expect(joined.mated).toBe(true);
      expect(joined.track?.width).toBe(joined.profile?.widthMetres);
      expect(joined.track?.surface).toBe(joined.profile?.surface);
      expect(joined.mouthsMatch).toBe(true);
      expect(joined.bends).toBe(true);
      for (const transition of joined.transitions) {
        rotations.add(transition.rotation);
      }
    }
    // Placement draws the compounds' turns freely, so a real corner assembly turns in more than one way.
    expect(rotations.size).toBeGreaterThan(1);
  });
});
