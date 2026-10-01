// Cartridge data format (roobie/skelly#109). Data only: no geometry, no viewer, no export.
//
// Units: lengths in millimetres, angles in degrees, bullet and slug mass in grains (the unit the
// sources print), counts and shotgun gauge as plain numbers. Axial positions are measured from the
// head face (the closed end of the case) toward the mouth.
//
// Sourcing rule: every number carries a citation into the file's `sources` table. A value that
// cannot be sourced is `null` with a note; it is never filled in from memory. Where two standards
// disagree (C.I.P. vs SAAMI, say) the primary source's value is `value` and the others are recorded
// in `alternatives`, so the difference stays visible.
//
// The ammo module stays domain-agnostic like core: it must not import gun/ or viewer/, and core
// must not import ammo/ (checked by test/ammoBoundary.test.ts).

export const CARTRIDGE_FORMAT = 1;

/** How much weight a source carries. `synthetic` marks invented test data, never allowed in cartridges/. */
export type SourceReliability = 'standard' | 'manufacturer' | 'secondary' | 'synthetic';

export interface SourceDocument {
  /** Issuing body or publisher: 'C.I.P.', 'SAAMI', 'NATO', a manufacturer, an encyclopedia. */
  readonly body: string;
  readonly reliability: SourceReliability;
  readonly title: string;
  readonly url: string;
  /** A stable copy, for sources whose live URL moves or disappears. */
  readonly archiveUrl?: string;
  /** Date the document was fetched, YYYY-MM-DD. */
  readonly retrieved: string;
  /** The document's own revision or date, as it prints it. */
  readonly revision?: string;
  /** Hash of the fetched bytes, so the evidence can be matched later. */
  readonly sha256?: string;
}

export interface Citation {
  /** Key into `Cartridge.sources`. */
  readonly source: string;
  /** Where in the document: table, section, symbol or drawing callout. */
  readonly locator: string;
  /** The value exactly as the source prints it, when that differs from `value` (inches, half-angle…). */
  readonly verbatim?: string;
}

/** A value with its citation. `value` is null when no source could be found; `note` then says why. */
export interface Sourced<T> {
  readonly value: T | null;
  readonly cite: Citation | null;
  readonly note?: string;
}

/** Tolerance as the source prints it, as positive magnitudes in the measure's unit. */
export interface Tolerance {
  readonly minus?: number;
  readonly plus?: number;
}

/** The same dimension according to a source other than the primary one. */
export interface MeasureAlternative {
  readonly value: number;
  readonly cite: Citation;
  readonly tolerance?: Tolerance;
  readonly note?: string;
}

/** A sourced number. The unit follows from where it sits in the format (see `measureUnit`). */
export interface Measure extends Sourced<number> {
  readonly tolerance?: Tolerance;
  /** True when the source marks the value as a basic dimension (C.I.P. asterisk, SAAMI B). */
  readonly basic?: boolean;
  readonly alternatives?: readonly MeasureAlternative[];
}

export const CASE_MATERIALS = ['brass', 'steel', 'lacquered-steel', 'polymer-coated-steel', 'aluminium'] as const;
export type CaseMaterial = (typeof CASE_MATERIALS)[number];

export const PRIMER_TYPES = ['boxer', 'berdan'] as const;
export type PrimerType = (typeof PRIMER_TYPES)[number];

export interface Primer {
  /** Visible on a fired case, so a cartridge can offer both. */
  readonly options: readonly Sourced<PrimerType>[];
  readonly diameter: Measure;
  /** Trade size such as 'large rifle' or '209'. */
  readonly designation: Sourced<string>;
}

export interface Alias {
  readonly name: string;
  /** The source that uses this name. */
  readonly cite: Citation;
}

export const RELATIONS = ['same-external-dimensions', 'safe-in-chamber-of', 'unsafe-in-chamber-of'] as const;
export type Relation = (typeof RELATIONS)[number];

/**
 * A directed statement from this cartridge to another one. Read it as "this cartridge <relation>
 * `cartridge`", where the chamber relations are about the other cartridge's chamber:
 * `{ cartridge: '357-magnum', relation: 'safe-in-chamber-of' }` on .38 Special, and
 * `{ cartridge: '223-rem', relation: 'unsafe-in-chamber-of' }` on 5.56 NATO.
 */
export interface CartridgeRelation {
  /** `id` of the other cartridge. */
  readonly cartridge: string;
  readonly relation: Relation;
  readonly note?: string;
  readonly cite: Citation;
}

export interface CartridgeBase {
  readonly format: typeof CARTRIDGE_FORMAT;
  /** File-stem slug, also the target of `relatedTo`. */
  readonly id: string;
  /** Display designation, e.g. '7.62×39mm'. */
  readonly designation: string;
  readonly aliases: readonly Alias[];
  readonly sources: Readonly<Record<string, SourceDocument>>;
  /** Key into `sources` of the standard whose values are the primary ones. */
  readonly primarySource: string;
  readonly relatedTo: readonly CartridgeRelation[];
  /** Free-form remarks: source values not mapped to a field, caveats on how a symbol was read. */
  readonly notes: readonly string[];
}

// ---------------------------------------------------------------- metallic cartridges

export interface Rim {
  readonly diameter: Measure;
  /** Axial thickness of the rim, from the head face. */
  readonly thickness: Measure;
}

export interface ExtractorGroove {
  readonly diameter: Measure;
  readonly width: Measure;
  /** Angle between the case axis and the bevel from the groove up to the full body diameter. */
  readonly bevelAngle?: Measure;
}

export interface Belt {
  readonly diameter: Measure;
  /** Axial distance from the head face to the front face of the belt. */
  readonly width: Measure;
}

/** How the head is formed; independent of the body shape. */
export const HEAD_TYPES = ['rimless', 'rebated', 'belted', 'rimmed', 'semi-rimmed'] as const;
export type HeadType = (typeof HEAD_TYPES)[number];

/** Rim equal to the head diameter, cut with an extractor groove. */
export interface RimlessHead {
  readonly type: 'rimless';
  readonly extractorGroove: ExtractorGroove;
}

/** Rim narrower than the head diameter, with an extractor groove. */
export interface RebatedHead {
  readonly type: 'rebated';
  readonly extractorGroove: ExtractorGroove;
}

/** A belt ahead of the rim and groove. */
export interface BeltedHead {
  readonly type: 'belted';
  readonly extractorGroove: ExtractorGroove;
  readonly belt: Belt;
}

/** Rim clearly wider than the head; no groove. */
export interface RimmedHead {
  readonly type: 'rimmed';
}

/** Rim only slightly wider than the head; no groove. */
export interface SemiRimmedHead {
  readonly type: 'semi-rimmed';
}

export type Head = RimlessHead | RebatedHead | BeltedHead | RimmedHead | SemiRimmedHead;

export interface Shoulder {
  /** Axial position where the body ends and the shoulder cone starts. */
  readonly startPosition: Measure;
  /** Axial position where the cone meets the neck. */
  readonly endPosition: Measure;
  /** Included angle of the cone (twice the angle to the axis). */
  readonly angle: Measure;
}

export interface Neck {
  readonly diameterAtBase: Measure;
  readonly diameterAtMouth: Measure;
}

export const BODY_TYPES = ['bottleneck', 'straight'] as const;
export type BodyType = (typeof BODY_TYPES)[number];

export interface BottleneckBody {
  readonly type: 'bottleneck';
  readonly diameterAtHead: Measure;
  readonly diameterAtShoulderStart: Measure;
  readonly shoulder: Shoulder;
  readonly neck: Neck;
}

/** No shoulder or neck: a straight or tapered tube from head to mouth. */
export interface StraightBody {
  readonly type: 'straight';
  readonly diameterAtHead: Measure;
  readonly diameterAtMouth: Measure;
}

export type Body = BottleneckBody | StraightBody;

export interface MetallicCase {
  /** Head face to mouth. */
  readonly length: Measure;
  /** Axial position where the full-diameter body begins, after the rim, groove and belt. */
  readonly bodyStart: Measure;
  readonly rim: Rim;
  readonly head: Head;
  readonly body: Body;
  readonly materials: readonly Sourced<CaseMaterial>[];
  readonly primer: Primer;
}

export const BULLET_KINDS = [
  'fmj',
  'soft-point',
  'hollow-point',
  'armor-piercing',
  'tracer',
  'subsonic',
  'lead',
  'other',
] as const;
export type BulletKind = (typeof BULLET_KINDS)[number];

export interface BulletVariant {
  readonly kind: BulletKind;
  /** Source for the variant's existence. */
  readonly cite: Citation;
  readonly massGrains: Measure;
  readonly length?: Measure;
}

export interface BulletPayload {
  readonly type: 'bullet';
  readonly diameter: Measure;
  /** Typical length range over the variants. */
  readonly length: { readonly min: Measure; readonly max: Measure };
  readonly variants: readonly BulletVariant[];
}

export interface MetallicCartridge extends CartridgeBase {
  readonly kind: 'metallic';
  readonly case: MetallicCase;
  readonly payload: BulletPayload;
  readonly overallLength: { readonly max: Measure; readonly typical: Measure };
}

// ---------------------------------------------------------------- shotshells

export const HULL_MATERIALS = ['plastic', 'paper'] as const;
export type HullMaterial = (typeof HULL_MATERIALS)[number];

export const CLOSURES = ['fold-crimp', 'roll-crimp'] as const;
export type Closure = (typeof CLOSURES)[number];

export interface Hull {
  readonly outerDiameter: Measure;
  readonly materials: readonly Sourced<HullMaterial>[];
  readonly colors: readonly Sourced<string>[];
}

/** The metal head of a shotshell; always rimmed. */
export interface ShotshellHead {
  readonly rimDiameter: Measure;
  readonly rimThickness: Measure;
  /** Height of the metal head along the axis. */
  readonly height: Measure;
  readonly materials: readonly Sourced<CaseMaterial>[];
}

export interface ShotPayload {
  readonly type: 'shot';
  /** Trade name of the load, e.g. '00 buck'. */
  readonly name: Sourced<string>;
  readonly pelletCount: Sourced<number>;
  readonly pelletDiameter: Measure;
}

export const SLUG_STYLES = ['foster', 'brenneke', 'sabot', 'other'] as const;
export type SlugStyle = (typeof SLUG_STYLES)[number];

export interface SlugPayload {
  readonly type: 'slug';
  readonly style: Sourced<SlugStyle>;
  readonly diameter: Measure;
  readonly length: Measure;
  readonly massGrains: Measure;
}

export interface Shotshell extends CartridgeBase {
  readonly kind: 'shotshell';
  /** Gauge number, e.g. 12. */
  readonly gauge: Sourced<number>;
  readonly boreDiameter: Measure;
  readonly hull: Hull;
  readonly head: ShotshellHead;
  readonly closure: Sourced<Closure>;
  readonly length: {
    /** Fired, opened length: 70 for a 2¾″ shell. This is the shape of an ejected casing. */
    readonly nominal: Measure;
    /** Length with the crimp closed. */
    readonly loaded: Measure;
  };
  readonly payload: ShotPayload | SlugPayload;
  readonly primer: Primer;
}

export type Cartridge = MetallicCartridge | Shotshell;
