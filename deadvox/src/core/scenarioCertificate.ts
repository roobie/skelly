import type { BlockEntity } from './blockEntities.ts';
import type { CitySite } from './citySite.ts';
import { toChunk, type Vec3 } from './coords.ts';
import { ladderOutward } from './ladders.ts';
import type { ScenarioComposition } from './scenarioComposition.ts';
import { ScenarioRouteSpace } from './scenarioRoute.ts';
import { STAIR_BODY_HALF_WIDTH } from './stairFlight.ts';
import { type Placement, placedPieces } from './templates.ts';

export interface ScenarioCertificate {
  readonly issues: readonly [string, string][];
  readonly space: ScenarioRouteSpace;
}
interface Descent {
  readonly ladder?: Readonly<Vec3> | undefined;
  readonly upper: Readonly<Vec3>;
  readonly lower: Readonly<Vec3>;
}

class Certificate {
  readonly space: ScenarioRouteSpace;
  readonly issues: [string, string][] = [];
  readonly origins = new Map<number, Readonly<Vec3>>();
  readonly links: [number, number][] = [];
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
    const elbow: Vec3 = [corner[0], plan.spawn[1], plan.spawn[2]];
    if (!(this.space.sweep(plan.spawn, elbow) && this.space.sweep(elbow, corner))) {
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

  bottomOf(descent: Descent): BlockEntity | undefined {
    if (descent.ladder) {
      return this.entityAt(descent.ladder);
    }
    this.space.clear(descent.lower);
    return [...this.space.entities.all].find(
      (entity) =>
        this.space.entities.defOf(entity).climbable &&
        entity.pos[1] === descent.lower[1] &&
        Math.hypot(entity.pos[0] - descent.lower[0], entity.pos[2] - descent.lower[2]) <= 3,
    );
  }

  shaft(descent: Descent, bottom: BlockEntity, centre: Vec3): boolean {
    const [, lower] = descent.lower;
    for (let feet = lower; feet <= descent.upper[1]; feet += 0.5) {
      if (!this.space.clear([centre[0], feet, centre[2]])) {
        return false;
      }
      const probeY = Math.min(Math.floor(feet), descent.upper[1] - 2);
      const piece = this.entityAt([Math.floor(centre[0]), probeY, Math.floor(centre[2])]);
      if (!(piece && this.space.entities.defOf(piece).climbable && piece.facing === bottom.facing)) {
        return false;
      }
    }
    return this.space.sweep(descent.lower, [centre[0], descent.lower[1], centre[2]]);
  }

  exitSupported(descent: Descent, bottom: BlockEntity, centre: Vec3, [dx, dz]: readonly [number, number]): boolean {
    const top: Vec3 = [centre[0] + dx, descent.upper[1], centre[2] + dz];
    const [ox, oz] = ladderOutward(bottom.facing);
    const h = STAIR_BODY_HALF_WIDTH;
    const overlaps =
      top[0] + h > bottom.pos[0] &&
      top[0] - h < bottom.pos[0] + bottom.size[0] &&
      top[2] + h > bottom.pos[2] &&
      top[2] - h < bottom.pos[2] + bottom.size[2];
    return (
      overlaps &&
      dx * ox + dz * oz <= 0 &&
      this.space.standing(top) &&
      this.space.sweep([centre[0], top[1], centre[2]], top, false) &&
      this.space.path(descent.upper, top) !== undefined
    );
  }

  exit(descent: Descent, bottom: BlockEntity, centre: Vec3): boolean {
    for (let dx = -1; dx <= 1; dx += 0.5) {
      for (let dz = -1; dz <= 1; dz += 0.5) {
        if (this.exitSupported(descent, bottom, centre, [dx, dz])) {
          return true;
        }
      }
    }
    return false;
  }

  ladder(descent: Descent, path: string): void {
    const bottom = this.bottomOf(descent);
    if (!(bottom && this.space.entities.defOf(bottom).climbable)) {
      this.fail(path, 'missing composed ladder');
      return;
    }
    const centre: Vec3 = [bottom.pos[0] + bottom.size[0] / 2, bottom.pos[1], bottom.pos[2] + bottom.size[2] / 2];
    const clear = this.shaft(descent, bottom, centre) && this.exit(descent, bottom, centre);
    if (!clear) {
      this.fail(path, 'composed ladder needs continuous body-clear shaft and supported braced landings');
    }
    const upper = this.floorLink(descent.upper, path);
    const lower = this.floorLink(descent.lower, path);
    if (upper && lower && clear) {
      this.links.push([descent.upper[1], descent.lower[1]]);
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
          this.site.registry.furniture.get(spawn.spec.type)?.readable &&
          spawn.spec.pos[0] >= placement.origin[0] &&
          spawn.spec.pos[0] < placement.origin[0] + placement.template.size[0] &&
          spawn.spec.pos[2] >= placement.origin[2] &&
          spawn.spec.pos[2] < placement.origin[2] + placement.template.size[2],
      );
    const nearby: Vec3 = [placement.origin[0] - 1, plan.floor + 1, placement.origin[2] - 1];
    const corner: Vec3 = [street / 2, plan.floor + 1, nearby[2]];
    const visible = sources.some((source) => {
      const entity = this.entityAt(source.spec.pos);
      return entity && this.space.visibleReach(nearby, entity);
    });
    const accessible =
      this.space.sweep(plan.spawn, corner) &&
      this.space.sweep(corner, nearby) &&
      this.space.standing(nearby) &&
      visible;
    if (!accessible) {
      this.fail(`.composition.leads[${index}]`, 'public clue needs independent street access and a readable face');
    }
    return accessible;
  }

  run(): ScenarioCertificate {
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
