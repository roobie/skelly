// Gun-specific rules, added to the core rules through the domain.

import { distanceWorld, worldSolid } from '../core/geometry.ts';
import type { Issue } from '../core/issue.ts';
import { applyDir, applyPoint, dot as dotProduct, sub } from '../core/math.ts';
import type { PortRef, Resolved, ResolvedConnection } from '../core/resolve.ts';
import type { PartDef, Rule, Solid } from '../core/schema.ts';
import { FIRING_GRIP, G3_MAGAZINE_WELL_TILT, HANDGUARD_CLEARANCE, LOWER_LAYOUTS } from './parts.ts';

/** Something for the firing hand: a pistol grip or a stock with a wrist. */
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
 * Box-fed receivers need a lower/grip well; tube-fed and cylinder-fed
 * receivers cannot use a box-magazine well. Revolver action and cylinder feed
 * must be selected together.
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
  const action = receiverParams.action!.value;
  const lowerDef = r.defs.get(lower.part)!;
  const hasWell = lowerDef.ports.some((port) => port.mount === 'magazine') || hasGripMagazineWell(r, lower.part);
  const layout = r.params.get(lower.part)?.layout?.value;
  const what = layout ? `${lower.part} (${layout})` : lower.part;

  if ((action === 'revolver') !== (feed === 'cylinder')) {
    return [
      {
        rule: 'feed-match',
        message: `${receiver.part} uses ${action} action with ${feed} feed; revolvers require cylinder feed and other actions do not use it.`,
        parts: [receiver.part, lower.part],
      },
    ];
  }
  if ((feed === 'box' || feed === 'top') && !hasWell) {
    return [
      {
        rule: 'feed-match',
        message: `${receiver.part} is ${feed}-fed, but ${what} has no magazine well.`,
        parts: [receiver.part, lower.part],
      },
    ];
  }
  if ((feed === 'tube' || feed === 'cylinder') && hasWell) {
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
  Math.max(
    ...r.defs
      .get(part)!
      .solids.map((solid) =>
        solid.kind === 'box' ? solid.box.center[0] + solid.box.half[0] : Math.max(...solid.profile.map(([x]) => x)),
      ),
  );

/** A pistol barrel may show only a short 0.5–1.5u crown beyond the slide. */
export const pistolBarrelCrown: Rule = {
  id: 'pistol-barrel-crown',
  title: 'The pistol barrel fits its slide',
  check(r) {
    const slide = [...r.defs].find(([, def]) => def.family === 'slide')?.[0];
    const barrel = [...r.defs].find(([, def]) => def.family === 'barrel')?.[0];
    if (!(slide && barrel) || r.params.get(barrel)?.profile?.value !== 'pistol') {
      return [];
    }
    const crown = maximumLocalX(r, barrel) - maximumLocalX(r, slide);
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

const solidMaxX = (solid: Solid): number =>
  solid.kind === 'box' ? solid.box.center[0] + solid.box.half[0] : Math.max(...solid.profile.map(([x]) => x));

const solidHalfExtent = (solid: Solid, axis: 1 | 2): number => {
  if (solid.kind === 'box') {
    return Math.abs(solid.box.center[axis]) + solid.box.half[axis];
  }
  if (axis === 1) {
    return Math.max(...solid.profile.map(([, y]) => Math.abs(y)));
  }
  return Math.max(Math.abs(solid.z[0]), Math.abs(solid.z[1]));
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
  const handguardLength = Math.max(
    ...handguardDef.solids.map((solid) =>
      solid.kind === 'box' ? solid.box.center[0] + solid.box.half[0] : Math.max(...solid.profile.map(([x]) => x)),
    ),
  );
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
    const barrel = [...r.defs].find(([, def]) => def.family === 'barrel');
    if (!barrel) {
      return [];
    }
    const [barrelPart, barrelDef] = barrel;
    return [...r.defs].flatMap(([handguardPart, handguardDef]) => {
      if (handguardDef.family !== 'handguard' || r.params.get(handguardPart)?.mount?.value !== 'free-float') {
        return [];
      }
      const issue = freeFloatFitIssue(r, { handguardPart, handguardDef, barrelPart, barrelDef });
      return issue ? [issue] : [];
    });
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
