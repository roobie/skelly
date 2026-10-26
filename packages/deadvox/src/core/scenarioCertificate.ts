import type { BlockEntity } from './blockEntities.ts';
import { cityLotRouteIssues, perimeterRouteIssues } from './cityLots.ts';
import type { CitySite } from './citySite.ts';
import type { Underground } from './cityUnderground.ts';
import { type ClimbLink, climbCertificate } from './climbCertificate.ts';
import { toChunk, type Vec3 } from './coords.ts';
import type { ScenarioComposition, ScenarioResource } from './scenarioComposition.ts';
import { ScenarioRouteSpace } from './scenarioRoute.ts';
import type { StartDescent } from './scenarioStart.ts';
import { type Placement, placedPieces, placedPoint } from './templates.ts';

export interface ScenarioCertificate {
  readonly issues: readonly [string, string][];
  readonly space: ScenarioRouteSpace;
}

export type CertificatePhase =
  | 'start'
  | 'lots'
  | 'service'
  | 'street'
  | 'floors'
  | 'seals'
  | 'ladders'
  | 'stairs'
  | 'underground'
  | 'objective'
  | 'resources'
  | 'leads'
  | 'lotResources';

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
        solid: ([x, y, z]) => this.space.blocked(x, y, z),
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

  /** The sewer is a second way in, so each mouth must reach each port as surely as the hatch reaches the lab. */
  underground(): void {
    for (const [index, { definition, placement }] of this.site.plan.underground.entries()) {
      const path = `.city.underground[${index}]`;
      for (const [mouthIndex, mouth] of definition.mouths.entries()) {
        const lower = this.mouth(placement, mouth, `${path}.mouths[${mouthIndex}]`);
        for (const [portIndex, port] of definition.ports.entries()) {
          this.port(placement, lower, port, `${path}.ports[${portIndex}]`);
        }
      }
    }
  }

  mouth(placement: Placement, mouth: Underground['mouths'][number], path: string): Readonly<Vec3> {
    const anchor = placement.template.pieces.findIndex((piece) => piece.pos.join(',') === mouth.ladder.join(','));
    const link = {
      ladder: placedPieces(placement)[anchor]?.pos,
      upper: placedPoint(placement, mouth.upper),
      lower: placedPoint(placement, mouth.lower),
    };
    if (!this.startFeet.some((foot) => this.space.path(foot, link.upper))) {
      this.fail(path, 'mouth needs a supported street route from the start');
    }
    const issue = this.climbIssue(link);
    if (issue) {
      this.fail(path, issue);
    }
    return link.lower;
  }

  port(placement: Placement, lower: Readonly<Vec3>, port: Underground['ports'][number], path: string): void {
    const service = this.site.plan.service!;
    const outside = placedPoint(placement, port.outside);
    const threshold = placedPoint(service, port.threshold);
    const inside = placedPoint(service, port.inside);
    if (!this.space.path(lower, outside, { placement })) {
      this.fail(path, 'tunnel needs a supported body route from the mouth to the port');
    } else if (this.space.sweep(outside, threshold) && this.space.sweep(threshold, inside)) {
      this.floorLink(inside, path);
    } else {
      this.fail(path, 'port needs a supported body crossing into the service');
    }
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

  stockAt(at: Readonly<Vec3>) {
    const spawn = this.site
      .furnitureIn(toChunk(at[0]), toChunk(at[2]))
      .find((candidate) => candidate.spec.pos.join(',') === at.join(','));
    return spawn && [...spawn.loot, ...(spawn.surfaceLoot ?? [])];
  }

  stocked(holder: Pick<ScenarioResource, 'at' | 'standing'>): boolean {
    const source = this.entityAt(holder.at);
    return Boolean(
      this.fixedSource(holder.at) &&
        source &&
        this.space.visibleReach(holder.standing, source) &&
        (this.stockAt(holder.at)?.length ?? 0) > 0,
    );
  }

  heldLocks(at: Readonly<Vec3>): string[] {
    return (this.stockAt(at) ?? []).flatMap((item) => {
      const lock = this.site.registry.items.get(item.type)?.key?.lock;
      return lock ? [lock] : [];
    });
  }

  resource(resource: ScenarioResource, index: number, reached: Set<number>): void {
    const path = `.composition.resources[${index}]`;
    const accessible =
      this.floorLink(resource.standing, path) && reached.has(resource.standing[1]) && this.stocked(resource);
    if (!accessible) {
      this.fail(path, 'fixed resource must be accessible without a key or resource dependency');
    }
  }

  /** Takes the key from its holder and returns where it is carried from and what it opens, or undefined on failure. */
  keyRoute(
    key: NonNullable<ScenarioResource['key']>,
    path: string,
  ): { feet: readonly Readonly<Vec3>[]; locks: readonly string[] } | undefined {
    let feet: readonly Readonly<Vec3>[] = this.startFeet;
    const reaches = (to: Readonly<Vec3>) => feet.some((foot) => this.space.path(foot, to));
    for (const [climbIndex, climb] of key.climbs.entries()) {
      const at = `${path}.key.climbs[${climbIndex}]`;
      const issue = reaches(climb.lower) ? this.climbIssue(climb) : 'needs a supported body route to its climb';
      if (issue) {
        this.fail(at, `key route climb: ${issue}`);
        return undefined;
      }
      feet = [climb.upper];
    }
    const holder = this.entityAt(key.at);
    if (!(reaches(key.standing) && holder && this.space.visibleReach(key.standing, holder))) {
      this.fail(`${path}.key`, 'key holder needs a reachable visible face on the key route');
      return undefined;
    }
    const locks = this.heldLocks(key.at);
    if (locks.length === 0) {
      this.fail(`${path}.key`, 'key holder holds no key');
      return undefined;
    }
    return { feet: [key.climbs[0]?.lower ?? key.standing], locks };
  }

  /**
   * A lot's resource is proved from the start's feet, through its key's route alone when it has one: up the climbs to
   * the holder, back down the certified-reversible climbs, then in past only the locks its own key opens.
   */
  lotResource(resource: ScenarioResource, index: number): void {
    const path = `.composition.resources[${index}]`;
    const { key } = resource;
    const carried = key ? this.keyRoute(key, path) : { feet: this.startFeet, locks: [] };
    if (!carried) {
      return;
    }
    const { feet, locks } = carried;
    const issue = this.space.withLocks(locks, () => {
      if (!feet.some((foot) => this.space.path(foot, resource.standing))) {
        return key
          ? 'resource needs a supported body route from its key'
          : 'resource needs a supported body route from the start';
      }
      return this.stocked(resource) ? undefined : 'resource needs its promised stock in visible reach';
    });
    if (issue) {
      this.fail(path, issue);
    }
  }

  lotResources(): void {
    this.composition.resources.forEach((resource, index) => {
      if (resource.lot) {
        this.lotResource(resource, index);
      }
    });
  }

  groundCard(at: Readonly<Vec3>, lock: string): boolean {
    const source = this.site
      .lootPointsIn(toChunk(at[0]), toChunk(at[2]))
      .find((point) => point.channel === 'ground' && point.destination.every((value, axis) => value === at[axis]));
    return (
      source?.supply.kind === 'fixed' &&
      source.supply.items.some(
        (item) => this.site.registry.items.get(item.item)?.key?.lock === lock && (item.count ?? 1) > 0,
      )
    );
  }

  seals(): void {
    for (const [index, seal] of this.composition.seals.entries()) {
      const path = `.composition.seals[${index}]`;
      const doors = seal.doors.map((point) => this.entityAt(point));
      const lock = doors[0]?.lock?.id;
      if (
        !(
          lock &&
          doors.every((door) => door?.lock?.id === lock && door.lock.locked) &&
          this.space.path(this.site.plan.portal!.lower, seal.standing, { steps: true }) &&
          (seal.held
            ? this.stocked({ at: seal.key, standing: seal.standing }) && this.heldLocks(seal.key).includes(lock)
            : this.groundCard(seal.key, lock) && this.space.visibleGroundReach(seal.standing, seal.key))
        )
      ) {
        this.fail(path, 'seal needs its matching placed keycard reachable on the open side before unlocking');
        continue;
      }
      this.space.admitLock(lock);
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

  /**
   * Runs the named phases in certificate order, or all of them. A phase leans on the earlier ones it reads from
   * (start feet, storey origins, ladder and stair links, admitted seals), so a narrowed run names those too.
   */
  run(only?: ReadonlySet<CertificatePhase>): ScenarioCertificate {
    let reached: ReturnType<Certificate['reachableFloors']> | undefined;
    const floors = () => {
      reached ??= this.reachableFloors();
      return reached;
    };
    const phases: readonly (readonly [CertificatePhase, () => void])[] = [
      ['start', () => this.start()],
      ['lots', () => this.issues.push(...cityLotRouteIssues(this.site.plan.lots ?? [], this.space, this.startFeet))],
      ['service', () => this.serviceRoutes()],
      ['street', () => this.street()],
      ['floors', () => this.floors()],
      ['seals', () => this.seals()],
      ['ladders', () => this.ladders()],
      ['stairs', () => this.stairs()],
      ['underground', () => this.underground()],
      ['objective', () => this.objective(floors())],
      ['resources', () => this.fixedResources(floors())],
      ['leads', () => this.leads()],
      ['lotResources', () => this.lotResources()],
    ];
    for (const [phase, step] of phases) {
      if (!only || only.has(phase)) {
        step();
      }
    }
    return { space: this.space, issues: this.issues };
  }

  private ladders(): void {
    this.ladder(this.site.plan.portal!, '.portal');
    this.composition.descents.forEach((descent, index) => {
      this.ladder(descent, `.composition.descents[${index}]`);
    });
  }

  private fixedResources(reached: ReturnType<Certificate['reachableFloors']>): void {
    this.composition.resources.forEach((resource, index) => {
      if (!resource.lot) {
        this.resource(resource, index, reached);
      }
    });
  }

  private serviceRoutes(): void {
    const routes = this.site.plan.grid.service?.routes;
    if (routes) {
      this.issues.push(
        ...perimeterRouteIssues(
          { placement: this.site.plan.service!, routes },
          this.space,
          this.startFeet,
          '.city.service',
        ),
      );
    }
  }

  private stairs(): void {
    this.composition.stairs.forEach((stair, index) => {
      const path = `.composition.stairs[${index}]`;
      const upper = this.floorLink(stair.upper, path);
      const lower = this.floorLink(stair.lower, path);
      const down = this.space.path(stair.upper, stair.lower, { steps: true });
      const up = this.space.path(stair.lower, stair.upper, { steps: true });
      if (!(down && up)) {
        this.fail(path, 'stair needs supported body routes down and back up');
      } else if (upper && lower) {
        this.links.push([stair.upper[1], stair.lower[1]]);
      }
    });
  }

  private leads(): void {
    const leads = this.composition.leads.map((placement, index) => this.lead(placement, index));
    for (let missed = 0; missed < leads.length; missed++) {
      if (!leads.some((accessible, index) => index !== missed && accessible)) {
        this.fail('.composition.leads', 'missing one clue must leave an independent accessible lead');
      }
    }
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

/** The start and lot resources alone, so a lot-resource case need not certify the lab. */
export const scenarioLotResourceCertificate = (site: CitySite): ScenarioCertificate => {
  const { composition } = site.plan;
  if (!composition) {
    return scenarioStartCertificate(site);
  }
  const certificate = new Certificate(site, composition);
  certificate.start();
  certificate.lotResources();
  return { space: certificate.space, issues: certificate.issues };
};

/** `only` narrows the run to the named phases, so a case that probes one rule need not certify the whole lab. */
export const scenarioCertificate = (site: CitySite, only?: readonly CertificatePhase[]): ScenarioCertificate => {
  const { composition, service, portal } = site.plan;
  if (!(composition && service && portal)) {
    return {
      space: new ScenarioRouteSpace(site),
      issues: [['.composition', 'scenario needs its final composed route metadata']],
    };
  }
  return new Certificate(site, composition).run(only && new Set(only));
};
