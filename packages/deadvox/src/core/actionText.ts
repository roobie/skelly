// The words the player's actions use: refusals, handling labels and held-item details (`DESIGN.md`,
// "Action text is content"). Content authors every line; code only fills named placeholders.

import { check, type InferOutput, nonEmpty, pipe, strictObject, string, transform } from 'valibot';
import type { Registry } from './content.ts';
import { CORE_CONTENT_IDS } from './contentIds.ts';

const PLACEHOLDER = /\{(\w+)\}/g;

const placeholdersIn = (text: string): Set<string> =>
  new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1]!));

/** A line with no placeholder. */
const Line = pipe(
  string(),
  nonEmpty('must not be empty'),
  check((text) => placeholdersIn(text).size === 0, 'must not contain a {placeholder}'),
);

declare const templateNames: unique symbol;
/** A validated template whose placeholders are exactly `N`. */
type Template<N extends string> = string & { readonly [templateNames]: N };

/** A line that must use every named placeholder, and no other. */
const Template = <const N extends string>(...names: readonly N[]) =>
  pipe(
    string(),
    nonEmpty('must not be empty'),
    check(
      (text) => {
        const used = placeholdersIn(text);
        return used.size === names.length && names.every((name) => used.has(name));
      },
      `must use exactly the placeholders ${names.map((name) => `{${name}}`).join(', ')}`,
    ),
    transform((text) => text as Template<N>),
  );

/** Fills a template's placeholders; validation guaranteed each one is named. */
export const fillText = <N extends string>(
  template: Template<N>,
  values: Readonly<Record<N, string | number>>,
): string => template.replace(PLACEHOLDER, (_, name: string) => String(values[name as N]));

export const ActionTextSchema = strictObject({
  /** Refusals many actions share. */
  common: strictObject({ tooFar: Line, busy: Line, gone: Line, notHeld: Line }),
  /** Loading rounds into a gun or magazine. */
  loading: strictObject({
    roundsNotCarried: Line,
    noRounds: Line,
    noRoundsOf: Template('round'),
    full: Line,
    wrongRounds: Line,
    noRoomForRound: Line,
    otherHandFull: Line,
    cantReachRound: Line,
    loadRound: Template('count', 'capacity'),
    removeRound: Line,
  }),
  /** Firearm refusals, handling labels and the lines its details show. */
  firearm: strictObject({
    cylinderOpen: Line,
    cylinderClosed: Line,
    boltOpen: Line,
    chamberSpent: Line,
    chamberEmpty: Line,
    noMagazine: Line,
    takesNoMagazine: Line,
    noMagazineFitted: Line,
    magazineGone: Line,
    noRoomForMagazine: Line,
    changeMagazine: Line,
    insertMagazine: Line,
    removeMagazine: Line,
    rack: Template('gun'),
    charge: Template('gun'),
    cylinderDetail: Template('loaded', 'chambers'),
    openCylinderDetail: Template('loaded', 'chambers'),
    chamberDetail: Template('contents'),
    magazineDetail: Template('count', 'capacity'),
    noMagazineDetail: Line,
    boltOpenDetail: Line,
    boltClosedDetail: Line,
    retainedRoundDetail: Template('round'),
    tubeDetail: Template('count', 'capacity'),
    spentCase: Line,
    firedHull: Line,
    emptyChamber: Line,
  }),
  /** The revolver's handling steps but loading, each a label in the handling queue. */
  revolver: strictObject({
    open: Line,
    eject: Line,
    pick: Line,
    close: Line,
    cock: Line,
    pull: Line,
  }),
  magazine: strictObject({ empty: Line, cartridgesDetail: Template('count', 'capacity') }),
  trap: strictObject({ notInHands: Line, noGround: Line, notSet: Line }),
  downedBody: strictObject({
    gone: Line,
    noTool: Template('quality'),
    finishOff: Template('zombie'),
    dismember: Template('zombie', 'tool'),
  }),
  rest: strictObject({ unusable: Line }),
  unpacking: strictObject({
    cannot: Line,
    needTool: Line,
    notInHands: Line,
    toolGone: Line,
    noCan: Line,
    unpack: Template('item'),
  }),
  /** Using what's in the hands or on the quickbar, lights, and their details. */
  survival: strictObject({
    notInHands: Line,
    itemNotInHands: Template('item'),
    itemGone: Template('item'),
    itemMoved: Template('item'),
    itemOutOfReach: Template('item'),
    lightNotInHands: Line,
    batteryGone: Line,
    batteryOutOfReach: Line,
    toolNotInHands: Line,
    cartridgeGone: Line,
    cartridgeOutOfReach: Line,
    noWound: Template('item'),
    cantUseFromHere: Template('item'),
    nothingLeft: Line,
    rotten: Template('item'),
    needFirestarter: Line,
    outOfFuel: Line,
    burnedOut: Line,
    lightDied: Template('item'),
    freshnessDetail: Template('freshness'),
    batteryDetail: Template('percent'),
    fuelDetail: Template('percent'),
    lightOnDetail: Template('charge'),
    lightOffDetail: Template('charge'),
    igniterDetail: Line,
    actionListHeading: Template('item'),
  }),
  /** Labels in the held-item action list whose wording does not depend on the item or wound. */
  itemActions: strictObject({ stripRound: Line, swing: Line, use: Line, openCan: Line }),
  melee: strictObject({ tooTired: Line }),
  /** Labels of long actions in the handling readout. */
  longActions: strictObject({
    reading: Template('item'),
    readingUnnamed: Line,
    forcingPadlock: Line,
    treating: Template('item'),
    treatingUnnamed: Line,
    waiting: Line,
  }),
  treatment: strictObject({ gone: Line, doesNotApply: Line }),
  objective: strictObject({ survivorDied: Line, notObjective: Line, blocked: Line, nothingToRead: Line }),
});

export type ActionText = InferOutput<typeof ActionTextSchema>;

/** The core UI entry's action text; content validation requires that entry. */
export const actionText = (registry: Pick<Registry, 'ui'>): ActionText => {
  const ui = registry.ui.get(CORE_CONTENT_IDS.coreUi);
  if (!ui) {
    throw new Error('Missing core UI tuning');
  }
  return ui.actionText;
};
