import {
  array,
  check,
  integer,
  maxValue,
  minValue,
  number,
  optional,
  picklist,
  pipe,
  record,
  strictObject,
  tuple,
  boolean as vBoolean,
} from 'valibot';
import { BLOCK_DAMAGE_KINDS, type BlockDamageKind } from '../blockDamageKinds.ts';
import { MELEE_MOTIONS } from '../meleeMotion.ts';
import { Color, Count, Fraction, Id, Name, NonNegative, Positive } from './primitives.ts';

// ---- blocks ----

/**
 * Procedural surface patterns, drawn in the chunk shader. The index is the id the mesher
 * emits and the shader switches on (render/chunks.ts), so append, never reorder.
 */
export const BLOCK_PATTERNS = [
  'none',
  'brick',
  'planks',
  'cobble',
  'dressed',
  'rough',
  'tiles',
  'siding',
  'corrugated',
  'shingles',
  'noise',
  'camo',
] as const;

export const BlockMaterialSchema = pipe(
  strictObject({
    id: Id,
    minimumStrength: NonNegative,
    durability: Positive,
    resistance: strictObject(
      Object.fromEntries(BLOCK_DAMAGE_KINDS.map((kind) => [kind, Fraction])) as Record<
        BlockDamageKind,
        typeof Fraction
      >,
    ),
    massKg: Positive,
    span: Count,
    fallsTo: Id,
    rubble: array(strictObject({ item: Id, count: pipe(Count, minValue(1)) })),
    blowSound: Id,
    broken: strictObject({ tint: Color, strength: Fraction }),
    damaged: array(strictObject({ from: Fraction, tint: Color, strength: Fraction })),
  }),
  check(
    ({ damaged }) => damaged.every((step, at) => at === 0 || step.from > damaged[at - 1]!.from),
    'damage looks need strictly rising thresholds',
  ),
);

export const BlockSchema = strictObject({
  id: Id,
  material: Id,
  name: Name,
  color: Color,
  /** Blocks movement independently of sight and render geometry. */
  solid: vBoolean(),
  /** Blocks sight/aim/picking; ordinary blocks inherit their movement rule when omitted. */
  opaque: optional(vBoolean()),
  soundBlocking: optional(vBoolean()),
  /** A medium the body can be in, such as water; never derived from `solid`, since air is not solid either. */
  liquid: optional(vBoolean()),
  meleePass: optional(
    strictObject({
      motions: array(picklist(MELEE_MOTIONS)),
      minimumZombieReachMetres: Positive,
    }),
  ),
  /** Poles stay inside the occupied cell, so they need no separate collision rule. */
  fencePosts: optional(
    strictObject({
      widthBlocks: pipe(Positive, maxValue(1)),
      spacingBlocks: pipe(number(), integer(), minValue(1)),
    }),
  ),
  /** Open wire geometry; wireFraction controls coverage, while color supplies the tint. */
  wireMesh: optional(
    strictObject({
      cellsPerBlock: pipe(number(), integer(), minValue(1), maxValue(16)),
      wireFraction: pipe(number(), minValue(0.01), maxValue(0.5)),
    }),
  ),
  /** Content-owned brushing events: gentle movement and fast movement. */
  rustle: optional(strictObject({ gentle: Id, fast: Id })),
  footsteps: optional(record(Id, Id)),
  drops: optional(record(Id, Id)),
  /** Surface pattern; `none` when omitted. */
  pattern: optional(picklist(BLOCK_PATTERNS)),
  /** Whether render-only site weathering may affect this built material. */
  weatherable: optional(vBoolean()),
  /** Four-colour palette read only by the `camo` surface pattern. */
  patternPalette: optional(tuple([Color, Color, Color, Color])),
  /** Washout amount in [0, 1], read only by the `camo` surface pattern. */
  patternWashout: optional(pipe(number(), minValue(0), maxValue(1))),
});
