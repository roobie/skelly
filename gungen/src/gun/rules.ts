// Gun-specific rules, added to the core rules through the domain.

import { distanceWorld, localSolidBounds, penetrationWorld, worldSolid } from '../core/geometry.ts';
import type { Issue } from '../core/issue.ts';
import type { Vec3 } from '../core/math.ts';
import { add, applyDir, applyPoint, dot as dotProduct, IDENTITY, invert, length, scale, sub } from '../core/math.ts';
import type { PortRef, Resolved, ResolvedConnection } from '../core/resolve.ts';
import type { Box, PartDef, Rule, Solid } from '../core/schema.ts';
import { mountCanAccept } from './mounts.ts';
import { getOptic } from './optics.ts';
import { FIRING_GRIP, G3_MAGAZINE_WELL_TILT, HANDGUARD_CLEARANCE, LOWER_LAYOUTS, TRIGGER_GUARD } from './parts.ts';

/**
 * Rules judge only what they can place. A part with no path to the root (or a
 * broken connection) is missing from `r.placed`; the structure and
 * required-ports checks already report it, so a rule skips it rather than
 * reading a transform that is not there.
 */
const placedParts = (r: Resolved, family?: string): [string, PartDef][] =>
  [...r.defs].filter(([part, def]) => r.placed.has(part) && (family === undefined || def.family === family));

/** Iron sights also use the visual family role `sight`; only the `sight` registry key is a catalog optic. */
const placedOptics = (r: Resolved): [string, PartDef][] =>
  placedParts(r, 'sight').filter(([part]) => r.assembly.parts[part]?.family === 'sight');

/** Something for the firing hand: a pistol grip or a stock with a wrist. */
export const thumbholeGripMatch: Rule = {
  id: 'thumbhole-grip-match',
  title: 'Thumbhole stock and lower match',
  check(r) {
    const issues: Issue[] = [];
    for (const [stock] of placedParts(r, 'stock')) {
      if (r.params.get(stock)?.style?.value !== 'thumbhole') {
        continue;
      }
      const stockMount = r.connections.find((connection) => {
        const ends = [connection.from, connection.to];
        return (
          ends.some((end) => end.part === stock && end.port.id === 'front') &&
          ends.some((end) => r.defs.get(end.part)?.family === 'receiver')
        );
      });
      if (!stockMount) {
        continue;
      }
      const receiver = [stockMount.from.part, stockMount.to.part].find((part) => part !== stock);
      const lowerMount = r.connections.find((connection) => {
        const ends = [connection.from, connection.to];
        return (
          ends.some((end) => end.part === receiver && r.defs.get(end.part)?.family === 'receiver') &&
          ends.some((end) => r.defs.get(end.part)?.family === 'lower')
        );
      });
      const lower =
        lowerMount && [lowerMount.from.part, lowerMount.to.part].find((part) => r.defs.get(part)?.family === 'lower');
      if (!lower) {
        continue;
      }
      if (r.params.get(lower)?.layout?.value !== 'thumbhole') {
        issues.push({
          rule: 'thumbhole-grip-match',
          message: `${stock} uses a thumbhole stock, but ${lower} is not in thumbhole layout.`,
          parts: [stock, lower],
        });
      }
      for (const connection of r.connections) {
        const grip = gripPartOnLower(connection, lower);
        if (grip) {
          issues.push({
            rule: 'thumbhole-grip-match',
            message: `${grip} is a separate pistol grip, but the thumbhole stock provides the firing grip; remove the separate grip.`,
            parts: [stock, grip],
          });
        }
      }
    }
    return issues;
  },
};

export const actionHandleRest: Rule = {
  id: 'action-handle-rest',
  title: 'Action handles sit outside their travel volumes at rest',
  check(r) {
    const issues: Issue[] = [];
    for (const [part, def] of placedParts(r)) {
      for (const handle of def.solids.filter((solid) => solid.id === 'charging-handle' || solid.id === 'bolt-handle')) {
        const travel = def.keepOuts.find(({ id }) => id === handle.id);
        if (!travel) {
          issues.push({
            rule: 'action-handle-rest',
            message: `${part}.${handle.id} has no matching travel volume.`,
            parts: [part],
          });
          continue;
        }
        if (handle.kind !== 'box') {
          continue;
        }
        const handleBounds = localSolidBounds(handle);
        const travelBounds = localSolidBounds({ id: travel.id, kind: 'box', box: travel.box });
        const overlaps = handleBounds[0].map(
          (min, axis) =>
            Math.min(handleBounds[1][axis]!, travelBounds[1][axis]!) - Math.max(min!, travelBounds[0][axis]!),
        );
        const overlap = Math.min(...overlaps);
        if (overlap > 1e-6) {
          issues.push({
            rule: 'action-handle-rest',
            message: `${part}.${handle.id} overlaps its rest travel volume by ${overlap.toFixed(2)}u.`,
            parts: [part],
            keepOut: { part, id: travel.id },
          });
        }
      }
    }
    return issues;
  },
};

export const firingGrip: Rule = {
  id: 'firing-grip',
  title: 'There is a firing grip',
  check(r) {
    const held = [...r.placed.keys()].some((part) => r.defs.get(part)!.tags?.includes(FIRING_GRIP));
    if (held || r.placed.size === 0) {
      return [];
    }
    return [
      {
        rule: 'firing-grip',
        message: 'Nothing for the firing hand: add a pistol grip or a stock with a wrist (style "sporting").',
        parts: [],
      },
    ];
  },
};

/**
 * Box- and top-fed receivers need a lower/grip well; tube-fed receivers
 * cannot use a box-magazine well.
 */
const gripPartOnLower = (connection: ResolvedConnection, lowerPart: string): string | undefined => {
  if (connection.from.part === lowerPart && connection.from.port.id === 'grip') {
    return connection.to.part;
  }
  if (connection.to.part === lowerPart && connection.to.port.id === 'grip') {
    return connection.from.part;
  }
  return undefined;
};

const hasGripMagazineWell = (r: Resolved, lowerPart: string): boolean =>
  r.connections.some((connection) => {
    const gripPart = gripPartOnLower(connection, lowerPart);
    return gripPart !== undefined && r.defs.get(gripPart)!.ports.some((port) => port.mount === 'magazine');
  });

const feedIssuesForLower = (r: Resolved, receiver: PortRef, lower: PortRef): Issue[] => {
  const receiverParams = r.params.get(receiver.part)!;
  const feed = receiverParams.feed!.value;
  const lowerDef = r.defs.get(lower.part)!;
  const hasWell = lowerDef.ports.some((port) => port.mount === 'magazine') || hasGripMagazineWell(r, lower.part);
  const layout = r.params.get(lower.part)?.layout?.value;
  const what = layout ? `${lower.part} (${layout})` : lower.part;

  if ((feed === 'box' || feed === 'top') && !hasWell) {
    return [
      {
        rule: 'feed-match',
        message: `${receiver.part} is ${feed}-fed, but ${what} has no magazine well.`,
        parts: [receiver.part, lower.part],
      },
    ];
  }
  if (feed === 'tube' && hasWell) {
    return [
      {
        rule: 'feed-match',
        message: `${receiver.part} is ${feed}-fed, but ${what} has a magazine well it can't feed from.`,
        parts: [receiver.part, lower.part],
      },
    ];
  }
  return [];
};

const maximumLocalX = (r: Resolved, part: string): number =>
  Math.max(...r.defs.get(part)!.solids.map((solid) => localSolidBounds(solid)[1][0]));

/** A pistol barrel may show only a short 0.5–1.5u crown beyond the slide. */
export const pistolBarrelCrown: Rule = {
  id: 'pistol-barrel-crown',
  title: 'The pistol barrel fits its slide',
  check(r) {
    const [[slide] = []] = placedParts(r, 'slide');
    const [[barrel] = []] = placedParts(r, 'barrel');
    if (!(slide && barrel) || r.params.get(barrel)?.profile?.value !== 'pistol') {
      return [];
    }
    const barrelTransform = r.placed.get(barrel)!; // placedParts only returns placed parts
    const slideTransform = r.placed.get(slide)!;
    const barrelEnd = applyPoint(barrelTransform, [maximumLocalX(r, barrel), 0, 0]);
    const slideEnd = applyPoint(slideTransform, [maximumLocalX(r, slide), 0, 0]);
    const axis = applyDir(barrelTransform, [1, 0, 0]);
    const crown = dotProduct(sub(barrelEnd, slideEnd), axis);
    if (crown >= 0.5 && crown <= 1.5) {
      return [];
    }
    return [
      {
        rule: 'pistol-barrel-crown',
        message: `The barrel protrudes ${crown.toFixed(2)}u past the slide; the pistol crown must be 0.5–1.5u.`,
        parts: [barrel, slide],
      },
    ];
  },
};

const solidMaxX = (solid: Solid): number => localSolidBounds(solid)[1][0];

const solidHalfExtent = (solid: Solid, axis: 1 | 2): number => {
  const bounds = localSolidBounds(solid);
  return Math.max(Math.abs(bounds[0][axis]), Math.abs(bounds[1][axis]));
};

/** Handguards must fit within the receiver's actual front-face cross-section. */
export const handguardFit: Rule = {
  id: 'handguard-fit',
  title: 'The handguard fits the receiver front face',
  check(r) {
    const issues: Issue[] = [];
    for (const connection of r.connections) {
      const ends = [connection.from, connection.to];
      const handguard = ends.find((end) => r.defs.get(end.part)!.family === 'handguard' && end.port.id === 'rear');
      const receiver = ends.find((end) => r.defs.get(end.part)!.family === 'receiver' && end.port.id === 'handguard');
      if (!(handguard && receiver)) {
        continue;
      }
      const receiverFace = r.defs
        .get(receiver.part)!
        .solids.filter((solid) => Math.abs(solidMaxX(solid) - receiver.port.pos[0]) < 1e-6);
      const maxY = Math.max(...receiverFace.map((solid) => solidHalfExtent(solid, 1)));
      const maxZ = Math.max(...receiverFace.map((solid) => solidHalfExtent(solid, 2)));
      const handguardSolids = r.defs.get(handguard.part)!.solids;
      const extentY = Math.max(...handguardSolids.map((solid) => solidHalfExtent(solid, 1)));
      const extentZ = Math.max(...handguardSolids.map((solid) => solidHalfExtent(solid, 2)));
      if (extentY <= maxY + 1e-6 && extentZ <= maxZ + 1e-6) {
        continue;
      }
      issues.push({
        rule: 'handguard-fit',
        message: `${handguard.part} reaches ±${extentY.toFixed(2)}u high and ±${extentZ.toFixed(2)}u wide; the receiver front face allows ±${maxY.toFixed(2)}u and ±${maxZ.toFixed(2)}u.`,
        parts: [handguard.part, receiver.part],
      });
    }
    return issues;
  },
};

const freeFloatFitIssue = (
  r: Resolved,
  parts: { handguardPart: string; handguardDef: PartDef; barrelPart: string; barrelDef: PartDef },
): Issue | undefined => {
  const { handguardPart, handguardDef, barrelPart, barrelDef } = parts;
  const handguardTransform = r.placed.get(handguardPart)!;
  const barrelTransform = r.placed.get(barrelPart)!;
  const handguardLength = Math.max(...handguardDef.solids.map((solid) => localSolidBounds(solid)[1][0]));
  const axis = applyDir(handguardTransform, [1, 0, 0]);
  const handguardStart = applyPoint(handguardTransform, [0, 0, 0]);
  const distanceToPort = (id: string): number => {
    const port = barrelDef.ports.find((candidate) => candidate.id === id);
    return port
      ? dotProduct(sub(applyPoint(barrelTransform, port.pos), handguardStart), axis)
      : Number.POSITIVE_INFINITY;
  };
  const params = r.params.get(handguardPart)!;
  const requiredClearance = HANDGUARD_CLEARANCE[(params.clearance?.value ?? 'M') as keyof typeof HANDGUARD_CLEARANCE];
  const barrelSolids = barrelDef.solids.map((solid) => worldSolid(barrelTransform, solid));
  const handguardSolids = handguardDef.solids.map((solid) => worldSolid(handguardTransform, solid));
  const actualClearance = Math.min(
    ...barrelSolids.flatMap((barrelSolid) =>
      handguardSolids.map((handguardSolid) => distanceWorld(barrelSolid, handguardSolid)),
    ),
  );
  const sightViolation = handguardLength >= distanceToPort('front-sight') - 1e-6;
  const muzzleViolation = handguardLength >= distanceToPort('muzzle') - 1e-6;
  if (actualClearance >= requiredClearance - 1e-6 && !sightViolation && !muzzleViolation) {
    return undefined;
  }
  let reason: string;
  if (actualClearance < requiredClearance - 1e-6) {
    reason = `has only ${actualClearance.toFixed(2)}u barrel clearance; ${requiredClearance}u is required`;
  } else if (sightViolation) {
    reason = 'reaches the front sight';
  } else {
    reason = 'reaches the muzzle';
  }
  return {
    rule: 'free-float-clearance',
    message: `${handguardPart} free-float handguard ${reason}.`,
    parts: [handguardPart, barrelPart],
  };
};

export const freeFloatClearance: Rule = {
  id: 'free-float-clearance',
  title: 'The free-float handguard clears the barrel',
  check(r) {
    const [barrel] = placedParts(r, 'barrel');
    if (!barrel) {
      return [];
    }
    const [barrelPart, barrelDef] = barrel;
    return placedParts(r, 'handguard').flatMap(([handguardPart, handguardDef]) => {
      if (r.params.get(handguardPart)?.mount?.value !== 'free-float') {
        return [];
      }
      const issue = freeFloatFitIssue(r, { handguardPart, handguardDef, barrelPart, barrelDef });
      return issue ? [issue] : [];
    });
  },
};

const triggerGuardIds = [
  'trigger-guard-top',
  'trigger-guard-rear',
  'trigger-guard-front',
  'trigger-guard-bottom',
] as const;
const solidBounds = (solid: Solid): { min: Vec3; max: Vec3 } => {
  const [min, max] = localSolidBounds(solid);
  return { min, max };
};
const triggerGuardGeometryFits = (fingerBox: Box, guards: ReadonlyMap<string, Solid>): boolean => {
  const top = guards.get('trigger-guard-top');
  const rear = guards.get('trigger-guard-rear');
  const front = guards.get('trigger-guard-front');
  const bottom = guards.get('trigger-guard-bottom');
  if (![top, rear, front, bottom].every((solid) => solid && solid.kind !== 'revolved')) {
    return false;
  }
  const topBounds = solidBounds(top!);
  const rearBounds = solidBounds(rear!);
  const frontBounds = solidBounds(front!);
  const bottomBounds = solidBounds(bottom!);
  const fingerBounds = solidBounds({ id: 'trigger-guard-finger', kind: 'box', box: fingerBox });
  const close = (a: number, b: number) => Math.abs(a - b) <= 1e-8;
  const rearClearance = fingerBounds.min[0] - rearBounds.max[0];
  const frontClearance = frontBounds.min[0] - fingerBounds.max[0];
  const zBounds = [topBounds, rearBounds, frontBounds, bottomBounds];
  const fingerWorld = worldSolid(IDENTITY, { id: 'trigger-finger', kind: 'box', box: fingerBox });
  const worldGuards = [top, rear, front, bottom].map((solid) => worldSolid(IDENTITY, solid!));
  const connected = [
    [0, 1],
    [0, 2],
    [3, 1],
    [3, 2],
  ].every(([a, b]) => distanceWorld(worldGuards[a!]!, worldGuards[b!]!) <= 1e-8);
  return (
    rearClearance > 1e-8 &&
    close(rearClearance, frontClearance) &&
    close(topBounds.min[1], fingerBounds.max[1]) &&
    close(topBounds.max[1], fingerBounds.max[1] + TRIGGER_GUARD.verticalWall) &&
    close(bottomBounds.max[1], fingerBounds.min[1]) &&
    close(bottomBounds.min[1], fingerBounds.min[1] - TRIGGER_GUARD.verticalWall) &&
    connected &&
    [topBounds, bottomBounds].every(
      (bounds) =>
        bounds.min[0] >= rearBounds.min[0] - 1e-8 &&
        bounds.min[0] <= rearBounds.max[0] + 1e-8 &&
        bounds.max[0] >= frontBounds.min[0] - 1e-8 &&
        bounds.max[0] <= frontBounds.max[0] + 1e-8,
    ) &&
    zBounds.every((bounds) => close(bounds.min[2], topBounds.min[2]) && close(bounds.max[2], topBounds.max[2])) &&
    worldGuards.every((guard) => penetrationWorld(guard, fingerWorld) <= 1e-8)
  );
};

const triggerGuardContactIssue = (
  r: Resolved,
  part: string,
  def: PartDef,
  guards: ReadonlyMap<string, Solid>,
): string | undefined => {
  const ownerTransform = r.placed.get(part)!;
  const guardSolids = triggerGuardIds.map((id) => guards.get(id)!);
  const bodySolids = def.solids.filter(({ id }) => !id.startsWith('trigger-guard-'));
  const worldGuards = guardSolids.map((guard) => worldSolid(ownerTransform, guard));
  const worldBody = bodySolids.map((body) => worldSolid(ownerTransform, body));
  const guardBodyPenetration = Math.max(
    0,
    ...worldGuards.flatMap((guard) => worldBody.map((body) => penetrationWorld(guard, body))),
  );
  if (guardBodyPenetration > 1e-8) {
    return `${part}'s trigger guard overlaps its frame or lower.`;
  }
  const topWorld = worldGuards[triggerGuardIds.indexOf('trigger-guard-top')]!;
  const topGap = Math.min(...worldBody.map((body) => distanceWorld(topWorld, body)));
  if (topGap > 1e-8) {
    return `${part}'s trigger guard top does not contact its frame or lower.`;
  }
  for (const connection of r.connections) {
    const gripPart = gripPartOnLower(connection, part);
    if (!gripPart) {
      continue;
    }
    const gripTransform = r.placed.get(gripPart);
    if (!gripTransform) {
      continue; // unplaced grip: nothing to measure the wall against
    }
    const gripSolids = r.defs.get(gripPart)!.solids.map((gripSolid) => worldSolid(gripTransform, gripSolid));
    const rearWorld = worldGuards[triggerGuardIds.indexOf('trigger-guard-rear')]!;
    const gap = Math.min(...gripSolids.map((gripSolid) => distanceWorld(rearWorld, gripSolid)));
    const penetration = Math.max(0, ...gripSolids.map((gripSolid) => penetrationWorld(rearWorld, gripSolid)));
    if (gap > 1e-8 || penetration > 1e-8) {
      return `${part}'s rear trigger-guard wall must contact ${gripPart} without a gap or overlap.`;
    }
    break;
  }
  for (const path of def.keepOuts.filter(({ id }) => id !== 'trigger-finger')) {
    const pathWorld = worldSolid(IDENTITY, { id: 'action-handle-path', kind: 'box', box: path.box });
    if (guardSolids.some((guard) => penetrationWorld(worldSolid(IDENTITY, guard), pathWorld) > 1e-8)) {
      return `${part}'s trigger guard crosses the ${path.id} keep-out.`;
    }
  }
  return undefined;
};

export const triggerGuard: Rule = {
  id: 'trigger-guard',
  title: 'Every trigger-finger volume has an enclosing guard',
  check(r) {
    const issues: Issue[] = [];
    for (const [part, def] of placedParts(r)) {
      const finger = def.keepOuts.find(({ id }) => id === 'trigger-finger');
      if (!finger) {
        continue;
      }
      const guards = new Map(
        def.solids.filter(({ id }) => id.startsWith('trigger-guard-')).map((solid) => [solid.id, solid]),
      );
      if (triggerGuardIds.some((id) => !guards.has(id))) {
        issues.push({
          rule: 'trigger-guard',
          message: `${part} has a trigger-finger volume but is missing its enclosing trigger guard.`,
          parts: [part],
        });
        continue;
      }
      const geometryIssue = triggerGuardGeometryFits(finger.box, guards)
        ? triggerGuardContactIssue(r, part, def, guards)
        : `${part}'s trigger guard does not enclose its trigger-finger volume.`;
      if (geometryIssue) {
        issues.push({ rule: 'trigger-guard', message: geometryIssue, parts: [part] });
      }
    }
    return issues;
  },
};

const tiltedWellSupportError = (layout: string, profile: string): string | undefined => {
  const layoutData = LOWER_LAYOUTS[layout as keyof typeof LOWER_LAYOUTS];
  const profiles: readonly string[] | undefined = layoutData?.tiltedMagazineProfiles;
  if (profiles?.includes(profile)) {
    return undefined;
  }
  return layoutData?.tiltedMagazineProfiles.length === 0
    ? `tilted magazines need a slanted well; the ${layout} layout has none.`
    : `tilted magazines need a slanted well; the ${layout} layout does not support the ${profile} profile.`;
};

const magazineAxisError = (
  r: Resolved,
  lower: PortRef,
  magazine: PortRef,
  styles: { mag: string; well: string },
): Issue | undefined => {
  const { mag: magStyle, well: wellStyle } = styles;
  const angle = magStyle === 'tilt' ? G3_MAGAZINE_WELL_TILT : 0;
  const expected: readonly [number, number, number] = [Math.sin(angle), -Math.cos(angle), 0];
  const port = r.defs.get(lower.part)!.ports.find(({ id }) => id === 'magazine')!;
  const dot = expected[0] * port.normal[0] + expected[1] * port.normal[1] + expected[2] * port.normal[2];
  const error = (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI;
  if (magStyle === wellStyle && error <= 0.5) {
    return undefined;
  }
  return {
    rule: 'magazine-well-axis',
    message:
      magStyle === wellStyle
        ? `${lower.part}'s well axis is ${error.toFixed(1)}° off ${magazine.part}'s ${magStyle} magazine axis.`
        : `${lower.part} declares ${wellStyle}, but ${magazine.part} uses ${magStyle}; the well must follow the magazine axis.`,
    parts: [lower.part, magazine.part],
  };
};

const opticContactPoints = (solids: readonly Solid[]): readonly Vec3[] =>
  solids.flatMap((solid) => {
    if (solid.kind !== 'box' || !solid.id.endsWith('foot')) {
      return [];
    }
    const { center, half } = solid.box;
    return [-1, 0, 1].flatMap((x) =>
      [-1, 0, 1].map((z): Vec3 => [center[0] + x * half[0], center[1] - half[1], center[2] + z * half[2]]),
    );
  });

/** A named rail is not enough: its contact feet must remain on the action body (or pistol slide). */
const opticSupportError = (
  r: Resolved,
  sight: string,
  host: PortRef,
  requiredContactLengthU: number,
): string | undefined => {
  const def = r.defs.get(host.part)!;
  if (!['receiver', 'slide'].includes(def.family) || host.port.id !== 'rail') {
    return 'requires the receiver top rail (the pistol uses its slide), not a handguard/scout mount';
  }
  const hostTransform = r.placed.get(host.part)!;
  const sightTransform = r.placed.get(sight)!;
  const toHost = invert(hostTransform);
  const body = def.solids.filter(
    ({ id }) => !id.includes('rail') && (def.family === 'slide' || id.startsWith('receiver-')),
  );
  const bodyBounds = body.map(localSolidBounds);
  const minX = Math.min(...bodyBounds.map(([min]) => min[0]));
  const maxX = Math.max(...bodyBounds.map(([, max]) => max[0]));
  const surfaces = def.solids.map((solid) => worldSolid(IDENTITY, solid));
  const contacts = opticContactPoints(r.defs.get(sight)!.solids);
  if (contacts.length === 0) {
    return 'missing physical mount feet';
  }
  const contactLength = Math.max(...contacts.map(([x]) => x)) - Math.min(...contacts.map(([x]) => x));
  if (contactLength < requiredContactLengthU - 1e-6) {
    return 'missing mount foot or physical contact span shorter than the mount requires';
  }
  for (const contact of contacts) {
    const local = applyPoint(toHost, applyPoint(sightTransform, contact));
    if (local[0] < minX - 1e-6 || local[0] > maxX + 1e-6 || Math.abs(local[1] - host.port.pos[1]) > 1e-6) {
      return 'mount foot extends beyond the receiver body or is not on its top';
    }
    const point = worldSolid(IDENTITY, { id: 'contact-probe', kind: 'box', box: { center: local, half: [0, 0, 0] } });
    if (!surfaces.some((surface) => distanceWorld(point, surface) <= 1e-6)) {
      return 'mount foot is not supported by a physical receiver top solid';
    }
  }
  return undefined;
};

export const opticMountFit: Rule = {
  id: 'optic-mount-fit',
  title: 'Optic footprint fits its generic mount interface',
  check(r) {
    const issues: Issue[] = [];
    for (const [sight] of placedOptics(r)) {
      const params = r.params.get(sight);
      const optic = getOptic(params?.type?.value, params?.mountSection?.value);
      const connection = r.connections.find((candidate) =>
        [candidate.from, candidate.to].some((end) => end.part === sight && end.port.id === 'base'),
      );
      if (!connection) {
        continue;
      }
      const host = connection.from.part === sight ? connection.to : connection.from;
      const { port } = host;
      const span = port.slots ? (port.slots.count - 1) * port.slots.pitch : 0;
      const slot = connection.conn.slot ?? 0;
      const supportError = opticSupportError(r, sight, host, optic.mount.contactLengthU);
      if (!mountCanAccept(port, optic.mount, slot) || supportError) {
        issues.push({
          rule: 'optic-mount-fit',
          message: `${sight} (${optic.id}) needs ${optic.mount.kind} with ${optic.mount.contactLengthU}u contact length, ${optic.mount.contactWidthU}u width, and ${optic.mount.minimumSlots} slots; ${host.part}.${port.id} offers ${port.mount} with ${span}u span at slot ${slot}.${supportError ? ` ${supportError}.` : ''}`,
          parts: [sight, host.part],
        });
      }
    }
    return issues;
  },
};

const OPTIC_SUPPORT_ID = /foot|mount|ring-band|base|bridge/;

const loadingBodyIds = (r: Resolved, part: string): ReadonlySet<string> => {
  if (r.assembly.parts[part]?.family !== 'sight') {
    return new Set();
  }
  const params = r.params.get(part);
  return new Set(
    getOptic(params?.type?.value, params?.mountSection?.value)
      .solids.filter(({ id }) => !OPTIC_SUPPORT_ID.test(id))
      .map(({ id }) => id),
  );
};

/** Refines the upper core keep-out allowance: real supports never bridge the opening; only bodies may.
 * The cartridge's angled loading path past those bodies is explicitly deferred to the tubular receiver.
 */
export const opticLoadingClearance: Rule = {
  id: 'keep-out',
  title: 'Only optic bodies may bridge above the loading mouth',
  check(r) {
    const issues: Issue[] = [];
    for (const [owner, def] of placedParts(r, 'receiver')) {
      const opening = def.keepOuts.find(
        ({ id, allowFamilies }) => id === 'loading-port' && allowFamilies?.includes('sight'),
      );
      if (!opening) {
        continue;
      }
      const volume = worldSolid(r.placed.get(owner)!, { id: opening.id, kind: 'box', box: opening.box });
      for (const [part, sightDef] of placedParts(r, 'sight')) {
        const bodies = loadingBodyIds(r, part);
        const intrudes = sightDef.solids.some(
          (solid) => !bodies.has(solid.id) && penetrationWorld(volume, worldSolid(r.placed.get(part)!, solid)) > 1e-6,
        );
        if (intrudes) {
          issues.push({
            rule: 'keep-out',
            message: `${part}'s foot, base, ring, bridge or unclassified solid crosses the loading opening of ${owner}; only optic bodies may bridge above it.`,
            parts: [part, owner],
            keepOut: { part: owner, id: opening.id },
          });
        }
      }
    }
    return issues;
  },
};

export const opticEyeRelief: Rule = {
  id: 'optic-eye-relief',
  title: 'Long optics have a stock cheek datum at eye relief',
  check(r) {
    const issues: Issue[] = [];
    for (const [sight] of placedOptics(r)) {
      const params = r.params.get(sight);
      const optic = getOptic(params?.type?.value, params?.mountSection?.value);
      if (optic.eyeReliefU === undefined) {
        continue;
      }
      const stock = placedParts(r, 'stock').find(
        ([part, def]) => def.axes.some((axis) => axis.kind === 'cheek') && r.placed.has(part),
      );
      const sightTransform = r.placed.get(sight)!;
      if (!stock) {
        issues.push({
          rule: 'optic-eye-relief',
          message: `${sight} (${optic.id}) needs a stock with a named cheek datum.`,
          parts: [sight],
        });
        continue;
      }
      const [stockPart, stockDef] = stock;
      const cheek = stockDef.axes.find((axis) => axis.kind === 'cheek')!;
      const eye = applyPoint(sightTransform, [optic.ocularX - optic.eyeReliefU, optic.opticalAxisY, 0]);
      const stockTransform = r.placed.get(stockPart)!;
      const cheekStart = applyPoint(stockTransform, cheek.origin);
      const cheekDirection = applyDir(stockTransform, cheek.dir);
      const eyeOffset = sub(eye, cheekStart);
      const alongCheek = dotProduct(eyeOffset, cheekDirection);
      const nearestCheekPoint = add(cheekStart, scale(cheekDirection, alongCheek));
      const eyeDatumError = length(sub(eye, nearestCheekPoint));
      const tolerance = optic.eyeDatumToleranceU ?? 4;
      if (eyeDatumError > tolerance) {
        issues.push({
          rule: 'optic-eye-relief',
          message: `${sight} (${optic.id}) eye point is ${eyeDatumError.toFixed(2)}u from ${stockPart}'s cheek datum; maximum is ${tolerance}u.`,
          parts: [sight, stockPart],
        });
      }
    }
    return issues;
  },
};

export const magazineWellAxis: Rule = {
  id: 'magazine-well-axis',
  title: 'The magazine well follows the magazine axis',
  check(r) {
    const issues: Issue[] = [];
    for (const connection of r.connections) {
      const ends = [connection.from, connection.to];
      const lower = ends.find((end) => r.defs.get(end.part)!.family === 'lower' && end.port.id === 'magazine');
      const magazine = ends.find((end) => r.defs.get(end.part)!.family === 'magazine' && end.port.id === 'top');
      if (!(lower && magazine)) {
        continue;
      }
      const magParams = r.params.get(magazine.part);
      const lowerParams = r.params.get(lower.part);
      const magStyle = magParams?.orientation?.value ?? 'straight';
      const wellStyle = lowerParams?.magazineOrientation?.value ?? 'straight';
      const layout = lowerParams?.layout?.value ?? 'conventional';
      const profile = magParams?.profile?.value ?? 'standard';
      if (magStyle === 'tilt') {
        const supportError = tiltedWellSupportError(layout, profile);
        if (supportError) {
          issues.push({ rule: 'magazine-well-axis', message: supportError, parts: [lower.part, magazine.part] });
          continue;
        }
      }
      const axisError = magazineAxisError(r, lower, magazine, { mag: magStyle, well: wellStyle });
      if (axisError) {
        issues.push(axisError);
      }
    }
    return issues;
  },
};

export const feedMatch: Rule = {
  id: 'feed-match',
  title: 'The lower suits the feed',
  check(r) {
    const issues: Issue[] = [];
    for (const connection of r.connections) {
      const ends = [connection.from, connection.to];
      const receiver = ends.find((end) => r.defs.get(end.part)!.family === 'receiver' && end.port.id === 'lower');
      const lower = ends.find((end) => end !== receiver);
      if (!(receiver && lower)) {
        continue;
      }
      issues.push(...feedIssuesForLower(r, receiver, lower));
    }
    return issues;
  },
};
