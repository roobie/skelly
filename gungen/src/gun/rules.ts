// Gun-specific rules, added to the core rules through the domain.

import type { Issue } from '../core/issue.ts';
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
 * A box-fed receiver needs a well on its lower or the lower's grip; tube-fed
 * receivers can't use either kind of box-magazine well.
 */
export const feedMatch: Rule = {
  id: 'feed-match',
  title: 'The lower suits the feed',
  check(r) {
    const issues: Issue[] = [];
    for (const rc of r.connections) {
      const ends = [rc.from, rc.to];
      const receiver = ends.find((e) => r.defs.get(e.part)!.family === 'receiver' && e.port.id === 'lower');
      const lower = ends.find((e) => e !== receiver);
      if (!(receiver && lower)) {
        continue;
      }
      const feed = r.params.get(receiver.part)!.feed!.value;
      const lowerDef = r.defs.get(lower.part)!;
      const gripWell = r.connections.some((connection) => {
        const gripPart =
          connection.from.part === lower.part && connection.from.port.id === 'grip'
            ? connection.to.part
            : connection.to.part === lower.part && connection.to.port.id === 'grip'
              ? connection.from.part
              : undefined;
        return gripPart !== undefined && r.defs.get(gripPart)!.ports.some((p) => p.mount === 'magazine');
      });
      const hasWell = lowerDef.ports.some((p) => p.mount === 'magazine') || gripWell;
      const layout = r.params.get(lower.part)?.layout?.value;
      const what = layout ? `${lower.part} (${layout})` : lower.part;
      if (feed !== 'tube' && !hasWell) {
        issues.push({
          rule: 'feed-match',
          message: `${receiver.part} is ${feed}-fed, but ${what} has no magazine well.`,
          parts: [receiver.part, lower.part],
        });
      } else if (feed === 'tube' && hasWell) {
        issues.push({
          rule: 'feed-match',
          message: `${receiver.part} is tube-fed, but ${what} has a magazine well it can't feed from.`,
          parts: [receiver.part, lower.part],
        });
      }
    }
    return issues;
  },
};
