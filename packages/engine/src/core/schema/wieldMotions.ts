import {
  array,
  check,
  type InferOutput,
  literal,
  nonEmpty,
  nullable,
  object,
  optional,
  picklist,
  pipe,
  record,
  strictObject,
  string,
  transform,
  boolean as vBoolean,
} from 'valibot';
import {
  BoneName,
  JointFrameSchema,
  JointLimitsSchema,
  PoseFrameSchema,
  PositiveInteger,
  QuatSchema,
  Vec3Schema,
} from './actors.ts';
import { Id, Positive } from './primitives.ts';

// ---- the doll's wields, as skelly-assets bakes them (its tools/wields.mjs, `exportWields`) ----

/** A strike's phases in the order it passes through them; the blow lands where `strike` ends. */
export const WIELD_PHASES = ['windup', 'strike', 'follow', 'recovery'] as const;

const SignedVec3 = pipe(
  Vec3Schema,
  check((v) => v.every((x) => x === 1 || x === -1), 'each axis sense must be 1 or -1'),
);

/**
 * The doll's bones: a hierarchy rooted at `root`, in the frame of the models it is dressed in. The rig also carries
 * what its bake solves with (reaches, grips, digits, the parts each bone binds), which a game does not read, so the
 * schema holds only the bones' rest and limits and leaves the rest of the file to the pack.
 */
export const DollRigSchema = pipe(
  object({
    id: Id,
    revision: PositiveInteger,
    frame: literal('model'),
    root: BoneName,
    bones: pipe(
      array(
        object({
          id: BoneName,
          parent: nullable(BoneName),
          head: Vec3Schema,
          tail: Vec3Schema,
          frame: JointFrameSchema,
          limits: JointLimitsSchema,
          /** The sign of each joint axis, by which the right side mirrors the left. */
          sense: SignedVec3,
        }),
      ),
      nonEmpty('needs at least one bone'),
    ),
  }),
  check(({ bones }) => new Set(bones.map(({ id }) => id)).size === bones.length, 'bone ids must be unique'),
  check(
    ({ root, bones }) => bones.some(({ id, parent }) => id === root && parent === null),
    'root must name a bone without a parent',
  ),
  check(({ root, bones }) => {
    const ids = new Set(bones.map(({ id }) => id));
    return bones.every(({ id, parent }) => (parent === null ? id === root : ids.has(parent)));
  }, 'every bone but the root must name a bone as its parent'),
);

export type DollRig = InferOutput<typeof DollRigSchema>;

// The pack writes a seat's turn to four places, so its length is off unit by up to this much.
const ROUNDED_UNIT_TOLERANCE = 1e-4;

const RoundedUnitQuatSchema = pipe(
  QuatSchema,
  check((q) => Math.abs(Math.hypot(...q) - 1) <= ROUNDED_UNIT_TOLERANCE, 'quaternion must be unit length'),
  transform((q): [number, number, number, number] => {
    const length = Math.hypot(...q);
    return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
  }),
);

/** The seat of a held weapon: its grip point and held axes (working end +z, up +y) in the leading hand bone's frame. */
const HeldSeatSchema = strictObject({ bone: BoneName, at: Vec3Schema, turn: RoundedUnitQuatSchema });

interface Struck {
  readonly durationSimSeconds?: number | undefined;
  readonly hitAtSimSeconds?: number | undefined;
  readonly phases?: readonly { readonly phase: string; readonly endsAtSimSeconds: number }[] | undefined;
}

const phasesInOrder = ({ phases }: Struck): boolean =>
  phases === undefined ||
  (phases.length === WIELD_PHASES.length &&
    phases.every(
      ({ phase, endsAtSimSeconds }, i) =>
        phase === WIELD_PHASES[i] && (i === 0 || endsAtSimSeconds > phases[i - 1]!.endsAtSimSeconds),
    ));

const endsOf = (phases: Struck['phases'], phase: (typeof WIELD_PHASES)[number]): number | undefined =>
  phases?.find((entry) => entry.phase === phase)?.endsAtSimSeconds;

/**
 * One wield clip: a stance (one frame), a strike (frames evenly through its phases) or a walk holding what the class
 * holds (a loop advanced by the ground travelled). A weapon class's clips carry `held`.
 */
export const WieldClipSchema = pipe(
  strictObject({
    kind: literal('pose'),
    loop: vBoolean(),
    frames: pipe(array(PoseFrameSchema), nonEmpty('needs at least one frame')),
    durationSimSeconds: optional(Positive),
    hitAtSimSeconds: optional(Positive),
    phases: optional(array(strictObject({ phase: picklist(WIELD_PHASES), endsAtSimSeconds: Positive }))),
    strideMetres: optional(Positive),
    // The pack's spelling, on the sim clock; the time lint baseline admits it as a released file's name.
    speedMetresPerSecond: optional(Positive),
    cycles: optional(PositiveInteger),
    held: optional(HeldSeatSchema),
  }),
  check(
    ({ durationSimSeconds, hitAtSimSeconds, phases }) =>
      (durationSimSeconds === undefined) === (phases === undefined) &&
      (hitAtSimSeconds === undefined) === (phases === undefined),
    'a strike states durationSimSeconds, hitAtSimSeconds and phases together',
  ),
  check(
    ({ loop, strideMetres, speedMetresPerSecond, cycles }) =>
      [strideMetres, speedMetresPerSecond, cycles].every((field) => (field === undefined) !== loop),
    'a walk loops and states strideMetres, speedMetresPerSecond and cycles; nothing else does',
  ),
  check(
    (clip) => phasesInOrder(clip),
    `phases must be ${WIELD_PHASES.join(', ')} in that order, each ending after the one before`,
  ),
  check(
    ({ phases, durationSimSeconds }) => phases === undefined || endsOf(phases, 'recovery') === durationSimSeconds,
    'the last phase must end at durationSimSeconds',
  ),
  check(
    ({ phases, hitAtSimSeconds }) => phases === undefined || endsOf(phases, 'strike') === hitAtSimSeconds,
    'hitAtSimSeconds must be where the strike phase ends',
  ),
);

export type WieldClip = InferOutput<typeof WieldClipSchema>;

/** A file of wield clips by name (`<class>_<action>_<kind>`), naming the rig they pose. */
export const WieldMotionsSchema = strictObject({
  // biome-ignore lint/style/useNamingConvention: the pack's file spells its note so.
  _doc: optional(string()),
  rig: strictObject({ id: Id, revision: PositiveInteger }),
  clips: record(Id, WieldClipSchema),
});

export type WieldMotions = InferOutput<typeof WieldMotionsSchema>;

/**
 * One set of wield motions: the declared pack files holding the rig and the clips that pose it. Only Node reads those
 * bytes, so the browser admits the row without loading them.
 */
export const WieldMotionSchema = strictObject({ id: Id, rig: string(), clips: string() });
