import type { BlockEntity } from './blockEntities.ts';
import { cityLotRouteIssues } from './cityLots.ts';
import type { CitySite } from './citySite.ts';
import { type ClimbLink, climbCertificate } from './climbCertificate.ts';
import { toChunk, type Vec3 } from './coords.ts';
import type { ScenarioComposition } from './scenarioComposition.ts';
import { ScenarioRouteSpace } from './scenarioRoute.ts';
import type { StartDescent } from './scenarioStart.ts';
import { type Placement, placedPieces } from './templates.ts';

export interface ScenarioCertificate {
  readonly issues: readonly [string, string][];
  readonly space: ScenarioRouteSpace;
}

class Certificate {
  readonly space: ScenarioRouteSpace;
  readonly issues: [string, string][] = [];
  readonly origins = new Map<number, Readonly<Vec3>>();
  readonly links: [number, number][] = [];
  readonly startFeet: Readonly<Vec3>[] = [];
  readonly site: CitySite;
  readonly composition: ScenarioComposition;

  constructor(site: CitySite, composition: ScenarioComposition) {
    this.site = site;
    this.composition = composition;
    this.space = new ScenarioRouteSpace(site);
  }

  fail(path: string, reason: string): void {
    this.issues.push([path, reason]);
  }

  connected(from: Readonly<Vec3>, to: Readonly<Vec3>, path: string): boolean {
    const route = this.space.path(from, to);
    if (!route) {
      this.fail(path, `no supported body route from ${from.join(',')} to ${to.join(',')}`);
    }
    return route !== undefined;
  }

  street(): void {
    const { plan } = this.site;
    const service = plan.service!;
    const { street, pad } = plan.grid;
    const corner: Vec3 = [service.origin[0] - pad - street / 2, plan.floor + 1, service.origin[2] - pad - street / 2];
    if (!this.startFeet.some((foot) => this.space.path(foot, corner))) {
      this.fail('.route.street', 'reserved street component has unsupported or obstructed body space');
    }
    this.connected(corner, plan.portal!.upper, '.portal.upper');
  }

  floors(): void {
    const { upper } = this.site.plan.portal!;
    this.origins.set(upper[1], upper);
    for (const storey of this.composition.storeys) {
      if (this.origins.has(storey.standing[1])) {
        this.fail('.composition.storeys', 'storey heights must be distinct');
      }
      this.origins.set(storey.standing[1], storey.standing);
      if (!this.space.standing(storey.standing)) {
        this.fail('.composition.storeys', 'storey anchor needs standing body clearance');
      }
    }
  }

  floorLink(point: Readonly<Vec3>, path: string): boolean {
    const origin = this.origins.get(point[1]);
    if (!origin) {
      this.fail(path, 'anchor has no admitted storey');
      return false;
    }
    return this.connected(origin, point, path);
  }

  entityAt(point: Readonly<Vec3>): BlockEntity | undefined {
    this.space.blocked(Math.floor(point[0]), Math.floor(point[1]), Math.floor(point[2]));
    return this.space.entities.at(...(point as Vec3));
  }

  climbIssue(descent: ClimbLink): string | undefined {
    return climbCertificate(
      {
        entities: this.space.entities,
        entityAt: (point) => this.entityAt(point),
        clear: (point) => this.space.clear(point),
        standing: (point) => this.space.standing(point),
        sweep: (from, to, supported) => this.space.sweep(from, to, supported),
        connected: (from, to) => this.space.path(from, to) !== undefined,
      },
      descent,
    );
  }

  ladder(descent: ClimbLink, path: string): void {
    const issue = this.climbIssue(descent);
    if (issue) {
      this.fail(path, issue);
    }
    const upper = this.floorLink(descent.upper, path);
    const lower = this.floorLink(descent.lower, path);
    if (upper && lower && !issue) {
      this.links.push([descent.upper[1], descent.lower[1]]);
    }
  }

  startDescent(descent: StartDescent): boolean {
    const { start } = this.composition;
    const walking = { steps: true, placement: start.placement };
    if (!this.space.path(this.site.plan.spawn, descent.upper, { placement: start.placement })) {
      return false;
    }
    switch (descent.kind) {
      case 'ladder':
        return this.climbIssue(descent) === undefined;
      case 'stairs': {
        const hatch = this.entityAt(descent.hatch);
        return Boolean(
          hatch &&
            this.space.entities.defOf(hatch).door?.hatch &&
            !hatch.lock?.locked &&
            this.space.path(descent.upper, descent.lower, walking),
        );
      }
      case 'drop':
        return (
          descent.edge[1] === descent.upper[1] &&
          Math.hypot(descent.edge[0] - descent.upper[0], descent.edge[2] - descent.upper[2]) <= 1 &&
          descent.landing[1] < descent.edge[1] &&
          descent.landing[0] === descent.edge[0] &&
          descent.landing[2] === descent.edge[2] &&
          this.space.sweep(descent.upper, descent.edge, false) &&
          this.space.sweep(descent.edge, descent.landing, false) &&
          Boolean(this.space.path(descent.landing, descent.lower, walking))
        );
      default:
        throw new Error(`Unsupported start descent ${JSON.stringify(descent)}`);
    }
  }

  start(): void {
    const { start } = this.composition;
    const open = start.descents.map((descent) => this.startDescent(descent));
    for (const [index, accessible] of open.entries()) {
      const foot = start.descents[index]!.lower;
      if (accessible && !this.startFeet.some((point) => point.join(',') === foot.join(','))) {
        this.startFeet.push(foot);
      }
    }
    if (this.startFeet.length < start.minimumOpenDescents) {
      this.fail('.composition.start.descents', 'not enough roof-rooted ways down remain open');
      open.forEach((accessible, index) => {
        if (!accessible) {
          this.fail(
            `.composition.start.descents[${index}]`,
            'way down is obstructed or disconnected from the roof spawn',
          );
        }
      });
    }
  }

  reachableFloors(): Set<number> {
    const reached = new Set([this.site.plan.portal!.upper[1]]);
    const queue = [...reached];
    for (const floor of queue) {
      const neighbours = this.links
        .filter(([a, b]) => a === floor || b === floor)
        .map(([a, b]) => (a === floor ? b : a));
      for (const next of neighbours) {
        if (!reached.has(next)) {
          reached.add(next);
          queue.push(next);
        }
      }
    }
    for (const storey of this.composition.storeys) {
      if (!reached.has(storey.standing[1])) {
        this.fail('.composition.storeys', `unreachable storey ${storey.id}`);
      }
    }
    return reached;
  }

  fixedSource(at: Readonly<Vec3>): boolean {
    return this.composition.lootSources.some(({ placement, fixedLoot }) => {
      const pieces = placedPieces(placement);
      return (
        fixedLoot?.some((stock) => {
          const index = placement.template.pieces.findIndex((piece) => piece.pos.join(',') === stock.at.join(','));
          return index >= 0 && pieces[index]!.pos.join(',') === at.join(',') && stock.items.length > 0;
        }) ?? false
      );
    });
  }

  resource(resource: ScenarioComposition['resources'][number], index: number, reached: Set<number>): void {
    const path = `.composition.resources[${index}]`;
    const source = this.entityAt(resource.at);
    const stock = this.site
      .furnitureIn(toChunk(resource.at[0]), toChunk(resource.at[2]))
      .find((spawn) => spawn.spec.pos.join(',') === resource.at.join(','));
    const accessible =
      this.fixedSource(resource.at) &&
      this.floorLink(resource.standing, path) &&
      reached.has(resource.standing[1]) &&
      source &&
      this.space.visibleReach(resource.standing, source) &&
      stock &&
      (stock.loot.length > 0 || (stock.surfaceLoot?.length ?? 0) > 0);
    if (!accessible) {
      this.fail(path, 'fixed resource must be accessible without a key or resource dependency');
    }
  }

  objective(reached: Set<number>): void {
    const { objectiveFace, objective, retreat } = this.composition;
    const entity = this.entityAt(objective);
    const accessible =
      this.floorLink(objectiveFace, '.composition.objectiveFace') &&
      reached.has(objectiveFace[1]) &&
      entity &&
      this.space.visibleReach(objectiveFace, entity);
    if (!accessible) {
      this.fail('.composition.objectiveFace', 'objective needs a reachable visible interaction face');
    }
    this.floorLink(retreat, '.composition.retreat');
  }

  lead(placement: Placement, index: number): boolean {
    const { plan } = this.site;
    const { street } = plan.grid;
    const sources = this.site
      .furnitureIn(toChunk(placement.origin[0]), toChunk(placement.origin[2]))
      .filter(
        (spawn) =>
          (this.site.registry.furniture.get(spawn.spec.type)?.readable ||
            [...spawn.loot, ...(spawn.surfaceLoot ?? [])].some(
              (item) => this.site.registry.items.get(item.type)?.readable,
            )) &&
          spawn.spec.pos[0] >= placement.origin[0] &&
          spawn.spec.pos[0] < placement.origin[0] + placement.template.size[0] &&
          spawn.spec.pos[2] >= placement.origin[2] &&
          spawn.spec.pos[2] < placement.origin[2] + placement.template.size[2],
      );
    const nearby: Readonly<Vec3> = this.composition.leadFaces?.[index] ?? [
      placement.origin[0] - 1,
      plan.floor + 1,
      placement.origin[2] - 1,
    ];
    const corner: Vec3 = [street / 2, plan.floor + 1, nearby[2]];
    const visible = sources.some((source) => {
      const entity = this.entityAt(source.spec.pos);
      return entity && this.space.visibleReach(nearby, entity);
    });
    const named = this.composition.leadFaces?.[index] !== undefined;
    const accessible =
      this.startFeet.some((foot) => this.space.path(foot, named ? nearby : corner)) &&
      (named || this.space.sweep(corner, nearby)) &&
      this.space.standing(nearby) &&
      visible;
    if (!accessible) {
      this.fail(`.composition.leads[${index}]`, 'public clue needs independent street access and a readable face');
    }
    return accessible;
  }

  run(): ScenarioCertificate {
    this.start();
    this.issues.push(...cityLotRouteIssues(this.site.plan.lots ?? [], this.space, this.startFeet));
    this.street();
    this.floors();
    this.ladder(this.site.plan.portal!, '.portal');
    this.composition.descents.forEach((descent, index) => {
      this.ladder(descent, `.composition.descents[${index}]`);
    });
    const reached = this.reachableFloors();
    this.objective(reached);
    this.composition.resources.forEach((resource, index) => {
      this.resource(resource, index, reached);
    });
    const leads = this.composition.leads.map((placement, index) => this.lead(placement, index));
    for (let missed = 0; missed < leads.length; missed++) {
      if (!leads.some((accessible, index) => index !== missed && accessible)) {
        this.fail('.composition.leads', 'missing one clue must leave an independent accessible lead');
      }
    }
    return { space: this.space, issues: this.issues };
  }
}

export const scenarioStartCertificate = (site: CitySite): ScenarioCertificate => {
  const { composition } = site.plan;
  if (!composition) {
    return {
      space: new ScenarioRouteSpace(site),
      issues: [['.composition', 'scenario needs its final composed route metadata']],
    };
  }
  const certificate = new Certificate(site, composition);
  certificate.start();
  return { space: certificate.space, issues: certificate.issues };
};

export const scenarioCertificate = (site: CitySite): ScenarioCertificate => {
  const { composition, service, portal } = site.plan;
  if (!(composition && service && portal)) {
    return {
      space: new ScenarioRouteSpace(site),
      issues: [['.composition', 'scenario needs its final composed route metadata']],
    };
  }
  return new Certificate(site, composition).run();
};
