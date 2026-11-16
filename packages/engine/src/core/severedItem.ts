// Which item a cut leaves: the cut point's part less the parts already cut away below it, each of which left as an
// item of its own, so no mass is carried twice.

import type { Bone } from './bones.ts';
import { severedBelow } from './boneTree.ts';
import type { ActorDef } from './schema/files.ts';

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id) => b.includes(id));

/** The item a cut at `part` leaves from a body whose cut points `severed` are gone, or none when the type lists none. */
export const severedItem = (
  items: ActorDef['severedItems'],
  bones: readonly Bone[],
  severed: readonly string[],
  part: string,
): string | undefined => {
  if (items === null || !Object.hasOwn(items, part)) {
    return undefined;
  }
  const gone = severedBelow(bones, severed, part);
  return items[part]!.find(({ without }) => sameSet(without, gone))?.item;
};
