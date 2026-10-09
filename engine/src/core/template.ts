// Templates: an archetype described as choices, turned into assemblies by
// generate.ts (PROJECT.md §6). Domain-agnostic: slots name part families and
// ports, and nothing here knows what they mean.

/** A value, or a list to pick one from uniformly. */
export type Choice<T> = T | readonly T[];

/** Reuse a parameter already chosen on an earlier template slot. */
export interface ParamReference {
  readonly fromSlot: string;
  readonly param: string;
}

export interface ParamCondition {
  readonly part: string;
  readonly param: string;
  readonly equals: string;
}

/** Choose a parameter value based on a parameter already selected on another slot. */
export interface ConditionalChoice {
  readonly when: ParamCondition;
  readonly onMatch: Choice<string>;
  readonly onMismatch: Choice<string>;
}

export type ParamChoice = Choice<string> | ParamReference | ConditionalChoice;

export interface SlotTemplate {
  /** Becomes the part id in the generated assembly. */
  readonly id: string;
  readonly family: string;
  /** Params to set. Unlisted params are left unset: default or inherited. */
  readonly params?: Readonly<Record<string, ParamChoice>>;
  /** Probability the part is included (default 1). */
  readonly chance?: number;
  /** Include this slot only when the referenced generated part parameter matches. */
  readonly when?: ParamCondition;
}

export interface ConnectionTemplate {
  /** "part.port"; with a list, one is picked among ports whose part is present. */
  readonly from: Choice<string>;
  /** "part.port" */
  readonly to: string;
  /** Slot on the `from` port: a number, a list to pick from, or any slot the port has. */
  readonly slot?: Choice<number> | 'any';
  /** Probability the connection is made, when both parts are present (default 1). */
  readonly chance?: number;
  /** Include this connection only when the referenced generated part parameter matches. */
  readonly when?: ParamCondition;
}

interface CalibreParamMapping {
  readonly slot: string;
  readonly param: string;
  readonly byCalibre: Readonly<Record<string, string>>;
}

export interface Template {
  readonly name: string;
  readonly description: string;
  /** Default cartridge-data id for generated designs, when the template defines one. */
  readonly calibre?: string;
  /** Generated part params selected by the template's calibre; curated designs may retain another offered value. */
  readonly calibreParams?: readonly CalibreParamMapping[];
  readonly root: string;
  readonly slots: readonly SlotTemplate[];
  readonly connections: readonly ConnectionTemplate[];
}
