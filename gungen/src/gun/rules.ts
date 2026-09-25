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
 * The lower under a receiver suits how the receiver feeds: box- and top-fed
 * receivers need a magazine well below them; tube-fed receivers can't use one.
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
      const hasWell = lowerDef.ports.some((p) => p.mount === 'magazine');
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
