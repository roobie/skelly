/** Rules the core always runs. Domains may add their own (Domain.rules). */
export const CORE_RULE_IDS = [
  /** The file can't be resolved as written: unknown parts, ports, params... */
  'structure',
  'port-compat',
  'axis-alignment',
  'solid-overlap',
  'keep-out',
  'required-ports',
  'loop-closure',
] as const;

export type CoreRuleId = (typeof CORE_RULE_IDS)[number];

export interface Issue {
  /** A core rule id, or one a domain added. */
  readonly rule: string;
  readonly message: string;
  /** Part ids involved, for highlighting. */
  readonly parts: readonly string[];
  /** Qualified port ids ("part.port") involved. */
  readonly ports?: readonly string[];
  /** Keep-out volume involved. */
  readonly keepOut?: { readonly part: string; readonly id: string };
}
