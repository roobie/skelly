// Templates: an archetype described as choices, turned into assemblies by
// generate.ts (PROJECT.md §6). Domain-agnostic: slots name part families and
// ports, and nothing here knows what they mean.

/** A value, or a list to pick one from uniformly. */
export type Choice<T> = T | readonly T[];

export interface SlotTemplate {
  /** Becomes the part id in the generated assembly. */
  readonly id: string;
  readonly family: string;
  /** Params to set. Unlisted params are left unset: default or inherited. */
  readonly params?: Readonly<Record<string, Choice<string>>>;
  /** Probability the part is included (default 1). */
  readonly chance?: number;
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
}

export interface Template {
  readonly name: string;
  readonly description: string;
  readonly root: string;
  readonly slots: readonly SlotTemplate[];
  readonly connections: readonly ConnectionTemplate[];
}
