export const RULE_IDS = [
  /** The file can't be resolved as written: unknown parts, ports, params... */
  'structure',
  'port-compat',
  'axis-alignment',
  'solid-overlap',
  'keep-out',
  'required-ports',
  'loop-closure',
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export interface Issue {
  readonly rule: RuleId;
  readonly message: string;
  /** Part ids involved, for highlighting. */
  readonly parts: readonly string[];
  /** Qualified port ids ("part.port") involved. */
  readonly ports?: readonly string[];
  /** Keep-out volume involved. */
  readonly keepOut?: { readonly part: string; readonly id: string };
}
