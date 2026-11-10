import { MATERIALS } from '@skelly/thing-core/materials';
import { OpticApertureSchema } from '@skelly/thing-core/optic-aperture';
import { ReticleSchema } from '@skelly/thing-core/reticle';
import { ModelPointSchema, modelSchema } from '@skelly/thing-core/schema';
import {
  array,
  type BaseIssue,
  type BaseSchema,
  check,
  finite,
  type InferOutput,
  integer,
  literal,
  maxValue,
  minLength,
  minValue,
  nonEmpty,
  number,
  optional,
  picklist,
  pipe,
  rawCheck,
  record,
  regex,
  strictObject,
  string,
  tuple,
  union,
  unknown,
  boolean as vBoolean,
} from 'valibot';
import { jfxrPresetIssues } from '../soundSynth.ts';
import {
  CalibreId,
  Color,
  Count,
  Fraction,
  Id,
  Name,
  NonNegative,
  Positive,
  PositiveRealSeconds,
  PositiveSimSeconds,
  SimPerMinute,
  SimSeconds,
} from './primitives.ts';

// ---- models ----

/** [x, y, z] in the model file's metres. */
export const Point = ModelPointSchema;

/**
 * A glTF binary in the pack, in metres, lying at rest on the ground with its long side
 * along x (`DESIGN.md`, "Piles and item models"). The entry adds what the file can't say.
 */
const SoundMultipliers = pipe(
  tuple([Positive, Positive]),
  check(([min, max]) => min <= max, 'minimum must not exceed maximum'),
);

/** A jfxr preset as the jfxr editor saves it, named so picks and the sound sheet can tell it apart. */
export const SoundRecipeSchema = strictObject({
  recipe: Id,
  jfxr: pipe(
    record(string(), unknown()),
    rawCheck(({ dataset, addIssue }) => {
      if (dataset.typed) {
        for (const message of jfxrPresetIssues(dataset.value)) {
          addIssue({ message });
        }
      }
    }),
  ),
});

export const SoundSchema = strictObject({
  id: Id,
  /** What makes the sound play, as the listening sheet tells a tester how to hear it. */
  description: Name,
  /** A `?debug=1` shortcut that makes the sound easier to reach on the listening sheet. */
  debugHint: optional(Name),
  variants: pipe(
    array(
      union([
        pipe(string(), regex(/^assets\/audio\/[a-z0-9_.-]+\.ogg$/, 'expected an Ogg file under assets/audio/')),
        SoundRecipeSchema,
      ]),
    ),
    nonEmpty('needs at least one variant'),
    check((variants) => {
      const names = variants.flatMap((v) => (typeof v === 'string' ? [] : [v.recipe]));
      return new Set(names).size === names.length;
    }, 'recipe names must be unique within a sound'),
  ),
  gain: pipe(Positive, maxValue(1, 'must be at most 1')),
  lowShelf: optional(strictObject({ frequencyHz: Positive, gainDb: pipe(number(), finite()) })),
  /** Scrambles the voice: a carrier of this frequency multiplies the sample by `1 - depth + depth * carrier`. */
  ringMod: optional(strictObject({ frequencyHz: Positive, depth: pipe(Positive, maxValue(1, 'must be at most 1')) })),
  pitchJitter: SoundMultipliers,
  gainJitter: SoundMultipliers,
  minIntervalSimSeconds: SimSeconds,
  category: picklist(['world', 'body', 'ui']),
  noise: strictObject({ enabled: vBoolean(), radiusMetres: Positive }),
  /** Most voices of this sound at once; a new one steals the oldest so a burst stays bounded. Absent is uncapped. */
  voiceCap: optional(pipe(Count, minValue(1, 'must be at least 1'))),
  wall: optional(
    strictObject({
      gain: pipe(NonNegative, maxValue(1, 'must be at most 1')),
      cutoffHz: Positive,
    }),
  ),
});

export const UnitVector = pipe(
  Point,
  check(([x, y, z]) => Math.abs(Math.hypot(x, y, z) - 1) <= 1e-6, 'must be a unit vector'),
);

const ActionCycleSchema = pipe(
  strictObject({
    durationSimSeconds: PositiveSimSeconds,
    rearwardSimSeconds: PositiveSimSeconds,
    dwellSimSeconds: SimSeconds,
    forwardSimSeconds: PositiveSimSeconds,
    unlockSimSeconds: optional(PositiveSimSeconds),
    lockSimSeconds: optional(PositiveSimSeconds),
  }),
  check(
    (cycle) =>
      (cycle.unlockSimSeconds ?? 0) +
        cycle.rearwardSimSeconds +
        cycle.dwellSimSeconds +
        cycle.forwardSimSeconds +
        (cycle.lockSimSeconds ?? 0) <=
      cycle.durationSimSeconds + 1e-9,
    'cycle phases must fit within durationSimSeconds',
  ),
);

const ActionPartSchema = strictObject({
  /** Exact GLB node name, e.g. `bolt-carrier:bolt-carrier`. */
  node: pipe(string(), nonEmpty('must not be empty')),
  axis: UnitVector,
  strokeMetres: Positive,
  handGrip: optional(Point),
  turn: optional(
    strictObject({
      pivot: Point,
      axis: UnitVector,
      angleRadians: pipe(
        number(),
        check((angle) => angle !== 0, 'turn angle must not be zero'),
      ),
    }),
  ),
  /** References shared timelines; modes not listed keep this node at home. */
  modes: pipe(
    array(picklist(['fire', 'hand'])),
    nonEmpty('needs at least one cycle mode'),
    check((modes) => new Set(modes).size === modes.length, 'cycle modes must be distinct'),
  ),
});

const ActionSchema = pipe(
  strictObject({
    parts: pipe(
      record(Id, ActionPartSchema),
      check((parts) => Object.keys(parts).length > 0, 'needs at least one moving part'),
    ),
    fire: optional(ActionCycleSchema),
    hand: ActionCycleSchema,
    ejectAt: Fraction,
    /** Unit direction vector in the exported model frame. */
    ejectDirection: UnitVector,
    holdOpen: vBoolean(),
    /** Cyclic rate in rounds per Sim minute. */
    roundsPerSimMinute: optional(SimPerMinute),
    triggerMode: optional(picklist(['semi', 'auto'])),
  }),
  check(
    (action) => Object.values(action.parts).every((part) => part.modes.every((mode) => action[mode] !== undefined)),
    'moving part modes must reference a declared timeline',
  ),
  check(
    (action) =>
      Object.values(action.parts).every(
        (part) =>
          !part.turn ||
          part.modes.every(
            (mode) => action[mode]?.unlockSimSeconds !== undefined && action[mode]?.lockSimSeconds !== undefined,
          ),
      ),
    'turning parts need unlock and lock phases in every referenced timeline',
  ),
  check(
    (action) => (action.fire === undefined) === (action.roundsPerSimMinute === undefined),
    'only an automatic fire timeline has a cyclic rpm',
  ),
  check(
    (action) => action.triggerMode === undefined || action.fire !== undefined,
    'trigger mode needs a fire timeline',
  ),
);

const RevolverRotationSchema = strictObject({
  node: pipe(string(), nonEmpty('must not be empty')),
  pivot: Point,
  axis: UnitVector,
});

const RevolverSchema = pipe(
  strictObject({
    chambers: pipe(number(), integer('must be a whole number'), minValue(1)),
    crane: strictObject({
      ...RevolverRotationSchema.entries,
      openRadians: pipe(
        number(),
        check((value) => Number.isFinite(value) && value !== 0, 'needs a finite nonzero angle'),
      ),
    }),
    cylinder: strictObject({
      node: pipe(string(), nonEmpty('must not be empty')),
      centre: Point,
      axis: UnitVector,
      chamberRadiusMetres: Positive,
      chamberZeroRadians: pipe(
        number(),
        check((value) => Number.isFinite(value), 'must be finite'),
      ),
    }),
    ejector: strictObject({
      node: pipe(string(), nonEmpty('must not be empty')),
      axis: UnitVector,
      strokeMetres: Positive,
    }),
    hammer: strictObject({
      ...RevolverRotationSchema.entries,
      cockRadians: pipe(
        number(),
        check((value) => Number.isFinite(value) && value !== 0, 'needs a finite nonzero angle'),
      ),
    }),
    trigger: strictObject({
      ...RevolverRotationSchema.entries,
      pullRadians: pipe(
        number(),
        check((value) => Number.isFinite(value) && value !== 0, 'needs a finite nonzero angle'),
      ),
    }),
  }),
  check(
    (value) =>
      new Set([value.crane.node, value.cylinder.node, value.ejector.node, value.hammer.node, value.trigger.node])
        .size === 5,
    'revolver parts need distinct nodes',
  ),
);

const MagazineRoundSchema = strictObject({
  /** Centre in metres in the magazine model frame (+x forward, +y up, +z right). */
  at: Point,
  /** Degrees about +z; nose-up is positive. */
  tilt: number(),
});

const MagazineCapacity = pipe(number(), integer('must be a whole number'), minValue(1, 'must be at least 1'));

const AttachmentPropertiesSchema = strictObject({
  magnification: optional(
    pipe(
      strictObject({ min: Positive, max: Positive }),
      check(({ min, max }) => max >= min, 'maximum magnification cannot be below minimum'),
    ),
  ),
  aperture: optional(OpticApertureSchema),
  reticle: optional(ReticleSchema),
  noiseFactor: optional(Fraction),
  wearClass: optional(picklist(['real', 'improvised'])),
  handlingClass: optional(pipe(string(), nonEmpty('must not be empty'))),
  railSpanNotches: optional(
    pipe(
      strictObject({
        minOffset: pipe(number(), integer('must be a whole number')),
        maxOffset: pipe(number(), integer('must be a whole number')),
      }),
      check(({ minOffset, maxOffset }) => minOffset <= maxOffset, 'maximum notch offset cannot be below minimum'),
    ),
  ),
});

const SightEyeRangeSchema = pipe(
  tuple([NonNegative, Positive]),
  check(([near, far]) => near < far, 'iron eye range must have near < far'),
);

const AttachmentSightSchema = pipe(
  strictObject({
    kind: picklist(['optic', 'iron']),
    eye: Point,
    direction: UnitVector,
    up: UnitVector,
    eyeReliefMetres: Positive,
    eyeDistanceRangeMetres: optional(SightEyeRangeSchema),
    ocularDiameterMetres: optional(Positive),
  }),
  check(
    ({ kind, eyeDistanceRangeMetres }) => (kind === 'iron') === (eyeDistanceRangeMetres !== undefined),
    'only iron sights require an eye distance range',
  ),
);

const AttachmentFieldsSchema = strictObject({
  id: pipe(string(), nonEmpty('must not be empty')),
  kind: picklist(['optic', 'iron-sight', 'suppressor', 'flashlight-mount', 'foregrip', 'muzzle-device']),
  mount: picklist(['rail-top', 'rail-side', 'rail-bottom', 'muzzle']),
  mountFrame: strictObject({ normal: UnitVector, up: UnitVector }),
  properties: AttachmentPropertiesSchema,
  sight: optional(AttachmentSightSchema),
});

const attachmentSpanMatchesMount = ({ mount, properties }: InferOutput<typeof AttachmentFieldsSchema>): boolean =>
  mount === 'muzzle' ? properties.railSpanNotches === undefined : properties.railSpanNotches !== undefined;

const attachmentSpanCheck = check(
  attachmentSpanMatchesMount,
  'rail attachments need a notch span and muzzle attachments cannot have one',
);

const attachmentHasOpticPresentation = ({ kind, properties }: InferOutput<typeof AttachmentFieldsSchema>): boolean =>
  (kind === 'optic') === (properties.reticle !== undefined) &&
  (kind === 'optic') === (properties.aperture !== undefined);

const AttachmentSchema = pipe(
  AttachmentFieldsSchema,
  attachmentSpanCheck,
  check(
    attachmentHasOpticPresentation,
    'optics need an authored reticle and aperture; other attachments cannot have them',
  ),
  check(
    ({ kind, properties }) => (kind === 'suppressor') === (properties.noiseFactor !== undefined),
    'suppressors need a noise factor and other attachments cannot have one',
  ),
);

const FittedAttachmentSchema = pipe(
  strictObject({
    ...AttachmentFieldsSchema.entries,
    node: pipe(string(), nonEmpty('must not be empty')),
    mountedAt: pipe(string(), nonEmpty('must not be empty')),
  }),
  check(
    (value) => attachmentHasOpticPresentation(value),
    'optics need an authored reticle and aperture; other attachments cannot have them',
  ),
  check(
    (value) => attachmentSpanMatchesMount(value),
    'rail attachments need a notch span and muzzle attachments cannot have one',
  ),
);

const AttachmentSlotSchema = pipe(
  strictObject({
    id: pipe(string(), nonEmpty('must not be empty')),
    mount: picklist(['rail-top', 'rail-side', 'rail-bottom', 'muzzle']),
    position: Point,
    direction: UnitVector,
    up: UnitVector,
    railId: optional(pipe(string(), nonEmpty('must not be empty'))),
    notchIndex: optional(pipe(number(), integer('must be a whole number'), minValue(0, 'must be non-negative'))),
  }),
  check(
    ({ mount, railId, notchIndex }) =>
      mount === 'muzzle'
        ? railId === undefined && notchIndex === undefined
        : railId !== undefined && notchIndex !== undefined,
    'rail slots need railId and notchIndex; muzzle interfaces cannot have them',
  ),
);

const AttachmentCompatibilityChoiceSchema = tuple([
  pipe(string(), nonEmpty('must not be empty')),
  pipe(string(), nonEmpty('must not be empty')),
]);

const AttachmentCompatibilityPairSchema = tuple([
  AttachmentCompatibilityChoiceSchema,
  AttachmentCompatibilityChoiceSchema,
]);

const ModelMagazineSlotSchema = strictObject({
  node: pipe(string(), nonEmpty('must not be empty')),
  at: Point,
  turn: Point,
});

const attachmentRangesDoNotOverlap = (
  attachments: readonly InferOutput<typeof FittedAttachmentSchema>[],
  slots: readonly InferOutput<typeof AttachmentSlotSchema>[],
): boolean => {
  const ranges = attachments.flatMap(({ mountedAt, properties }) => {
    const slot = slots.find(({ id }) => id === mountedAt);
    const span = properties.railSpanNotches;
    return slot?.railId !== undefined && slot.notchIndex !== undefined && span
      ? [{ railId: slot.railId, min: slot.notchIndex + span.minOffset, max: slot.notchIndex + span.maxOffset }]
      : [];
  });
  return ranges.every((a, index) =>
    ranges.slice(index + 1).every((b) => a.railId !== b.railId || a.max < b.min || b.max < a.min),
  );
};

export const GunModelSchema = pipe(
  strictObject({
    /** Cartridge-data id (not a display designation); punctuation is normalized only in model slugs. */
    calibre: optional(CalibreId),
    /** Full magazine capacity and one centre/tilt pose per round, ordered top to bottom. */
    capacity: optional(MagazineCapacity),
    /** Integral magazine, loaded singly through anchors.loading_port; no box round-pose column. */
    internalMagazine: optional(strictObject({ capacity: MagazineCapacity })),
    rounds: optional(array(MagazineRoundSchema)),
    /** Replaceable model parts and the gun-side mount frames for later fitting. */
    attachments: optional(array(FittedAttachmentSchema)),
    attachmentSlots: optional(array(AttachmentSlotSchema)),
    /** Complete per-slot allowlist certified by gungen; absence denies dynamic fitting. */
    compatibility: optional(
      record(pipe(string(), nonEmpty('must not be empty')), array(pipe(string(), nonEmpty('must not be empty')))),
    ),
    /** Complete pairwise allowlist; each tuple is [slot ID, attachment ID], absence denies pairs. */
    compatibilityPairs: optional(array(AttachmentCompatibilityPairSchema)),
    /** Exact baked GLB node and replacement transform for each item-owned model slot. */
    slots: optional(strictObject({ magazine: optional(ModelMagazineSlotSchema) })),
    /** Static model metadata for an attachment exported as its own item asset. */
    attachment: optional(AttachmentSchema),
    /** Physical hold distance is independent of a fitted optic's viewing relief. */
    adsStandoffMetres: optional(Positive),
    /** Model-derived eye point, sight line and up axis for ADS presentation and ballistics. */
    sight: optional(
      strictObject({
        kind: picklist(['iron', 'optic']),
        eye: Point,
        eyeReliefMetres: NonNegative,
        eyeDistanceRangeMetres: optional(SightEyeRangeSchema),
        ocularDiameterMetres: optional(Positive),
        direction: UnitVector,
        up: UnitVector,
      }),
    ),
    /** Unit barrel direction in the same local model frame as anchors. */
    muzzleDirection: optional(UnitVector),
    /** Optional estimated action cycles and the named moving GLB nodes. */
    action: optional(ActionSchema),
    revolver: optional(RevolverSchema),
    /**
     * Where the charging handle sits around the bore: degrees from the top of the receiver toward the gun's right
     * (+z). A rack rolls the gun toward the off hand, further when the handle is on the far side (`DESIGN.md`, "Rifles"). Hand-authored: the export does not carry it.
     */
    chargingHandleDegrees: optional(pipe(number(), minValue(-180), maxValue(180))),
  }),
  check(
    ({ calibre, capacity, rounds }) =>
      capacity === undefined && rounds === undefined
        ? true
        : calibre !== undefined && capacity !== undefined && rounds !== undefined && rounds.length === capacity,
    'magazine metadata needs calibre, capacity, and one round pose per capacity slot',
  ),
  check(
    ({ attachments, attachmentSlots }) =>
      attachments === undefined ||
      (attachmentSlots !== undefined &&
        new Set(attachments.map(({ mountedAt }) => mountedAt)).size === attachments.length &&
        attachments.every(({ mountedAt, mount }) =>
          attachmentSlots.some((slot) => slot.id === mountedAt && slot.mount === mount),
        ) &&
        attachmentRangesDoNotOverlap(attachments, attachmentSlots)),
    'fitted attachments need unique matching mount slots and non-overlapping rail spans',
  ),
  check(
    ({ sight }) => sight?.kind !== 'optic' || sight.ocularDiameterMetres !== undefined,
    'optic sight metadata needs an ocular opening diameter',
  ),
  check(
    ({ sight }) => sight === undefined || (sight.kind === 'iron') === (sight.eyeDistanceRangeMetres !== undefined),
    'only iron sights require an eye distance range',
  ),
  check(
    ({ internalMagazine, calibre, capacity, rounds }) =>
      internalMagazine === undefined || (calibre !== undefined && capacity === undefined && rounds === undefined),
    'internal magazine metadata needs calibre and cannot carry a box round column',
  ),
);

/**
 * The safety lever a fused throwable sheds when its fuse lights: the exported piece that leaves the model and
 * how it flies off (`DESIGN.md`, "Hand grenade"). Hand-authored: the export does not carry it.
 */
const LeverModelSchema = strictObject({
  piece: pipe(string(), nonEmpty()),
  launchMetresPerRealSecond: Positive,
  spinDegreesPerRealSecond: NonNegative,
  lifetimeRealSeconds: PositiveRealSeconds,
});

/**
 * The safety pin a fused throwable hides while it is pulled: the exported piece drawn as the pin and its ring
 * (`DESIGN.md`, "Hand grenade"). Hand-authored: the export does not carry it.
 */
const PinModelSchema = strictObject({ piece: pipe(string(), nonEmpty()) });

const ModelMaterialId = pipe(
  string(),
  check((id) => Object.hasOwn(MATERIALS, id), 'must name a model material'),
);

/** A magnetic compass card drawn on the model's display: it turns with its needle to point north. */
const CompassDialSchema = strictObject({
  /** Model materials whose colours paint the card, its marks and the needle's two ends. */
  face: ModelMaterialId,
  ink: ModelMaterialId,
  north: ModelMaterialId,
  south: ModelMaterialId,
  /** Labels spaced evenly clockwise from north, the first in the north colour. */
  marks: pipe(array(pipe(string(), nonEmpty())), nonEmpty()),
  /** Letter height, needle reach from the pin and needle width, as fractions of the card's radius. */
  markHeight: Fraction,
  needleLength: Fraction,
  needleWidth: Fraction,
});

export type CompassDial = InferOutput<typeof CompassDialSchema>;

/**
 * How a hand closes, by name: the empty fist, a hand around a plain grip, flat on a screen, a firing hand on a pistol
 * grip or on a stock wrist, or a support hand on a forend.
 */
const HAND_POSES = [
  'fist',
  'holding',
  'open',
  'pistolGrip',
  'pistolWrap',
  'pistolCup',
  'stockWrist',
  'forend',
] as const;

/**
 * One hand's hold on a held model, in the model's frame as authored for a right-handed hold: where the palm's face
 * meets the model, which way the palm presses and which way the straight fingers point before they curl. A left
 * hold mirrors the model's z. The palm and fingers are perpendicular, which validation checks.
 */
const HandHoldSchema = strictObject({ at: Point, palm: UnitVector, fingers: UnitVector, pose: picklist(HAND_POSES) });

/** Authored palm contacts avoid inferring a shoulder seat for free-held firearms. */
const HandsModelSchema = strictObject({
  ads: optional(
    strictObject({
      cameraOffsetLimitMetres: optional(NonNegative),
      stockShoulderLimitMetres: optional(NonNegative),
      // A free-held gun has no stock to lift the dominant shoulder under, so it overrides the figure's ADS rolls.
      torsoRollDegrees: optional(pipe(number(), minValue(0), maxValue(90))),
      headRollDegrees: optional(pipe(number(), minValue(0), maxValue(90))),
    }),
  ),
  seat: Point,
  butt: optional(Point),
  loweredPitchRadians: optional(pipe(number(), minValue(0), maxValue(Math.PI / 2))),
  torsoForwardDegrees: optional(pipe(number(), minValue(0), maxValue(90))),
  elbowBendSide: optional(Point),
  adsStandoffByPitch: optional(
    pipe(
      array(strictObject({ pitchDegrees: pipe(number(), minValue(-90), maxValue(90)), metres: Positive })),
      minLength(2),
      check(
        (points) => points.every((point, index) => index === 0 || point.pitchDegrees > points[index - 1]!.pitchDegrees),
        'standoff pitch points must be strictly increasing',
      ),
    ),
  ),
  adsViewEyeReliefMetres: optional(Positive),
  firing: HandHoldSchema,
  support: HandHoldSchema,
  /**
   * Where the support hand takes the gun while lying prone and aiming, nearer the body so the elbow hangs lower. It
   * moves the hand only: the palm, fingers and pose stay the support hold's, because the arm is built once with them.
   * A stocked gun (one that authors `butt`) must have it, which `checkHands` enforces; a free-held gun without one
   * keeps its support hold prone.
   */
  proneSupport: optional(strictObject({ at: Point })),
});

export type HandsModelDef = InferOutput<typeof HandsModelSchema>;

const PresentationBands = <T extends BaseSchema<unknown, unknown, BaseIssue<unknown>>>(entry: T) =>
  pipe(array(entry), minLength(1));

export const ItemWearSchema = strictObject({
  id: Id,
  bands: PresentationBands(
    strictObject({
      from: pipe(number(), minValue(0), maxValue(1)),
      tints: record(Id, strictObject({ color: Color, mix: pipe(number(), minValue(0), maxValue(1)) })),
    }),
  ),
});

export const ModelSchema = pipe(
  modelSchema({
    itemPresentation: optional(
      strictObject({
        materials: array(Id),
        wear: Id,
        supply: union([
          strictObject({ kind: literal('none') }),
          strictObject({
            kind: literal('fill'),
            piece: pipe(string(), nonEmpty()),
            axis: picklist(['x', 'y', 'z']),
            bands: PresentationBands(
              strictObject({
                from: pipe(number(), minValue(0), maxValue(1)),
                scale: pipe(number(), minValue(0), maxValue(1)),
              }),
            ),
          }),
        ]),
      }),
    ),
    gun: optional(GunModelSchema),
    dial: optional(CompassDialSchema),
    lever: optional(LeverModelSchema),
    pin: optional(PinModelSchema),
    hands: optional(HandsModelSchema),
  }),
  check(
    ({ gun, anchors }) => gun?.internalMagazine === undefined || anchors?.loading_port !== undefined,
    'internal magazine metadata needs a loading_port anchor',
  ),
  check(({ hands, grip }) => hands === undefined || grip !== undefined, 'hands need a grip to hold by'),
);
