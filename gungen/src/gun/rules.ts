// Gun-specific rules, added to the core rules through the domain.

import type { Issue } from '../core/issue.ts';
import type { PortRef, Resolved, ResolvedConnection } from '../core/resolve.ts';
import type { Rule } from '../core/schema.ts';
import { FIRING_GRIP } from './parts.ts';

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
