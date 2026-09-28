/** A validator finding: which rule, a readable message, and the bones it names. */
export interface Issue {
  readonly rule: string;
  readonly message: string;
  readonly bones?: readonly string[];
}
