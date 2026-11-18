export type ReadText = (path: string, encoding: 'utf8') => string;
export function analyzeFiles(files: readonly string[], read?: ReadText): string[];
export function temporalNameFindings(file: string, text: string, mode?: 'source' | 'json' | 'catalogue'): string[];
export function mixedArithmeticFindings(file: string, text: string): string[];
/** A parsed JSON value's keys, at any depth, that have a temporal name without a clock and unit. */
export function temporalKeyFindings(file: string, value: unknown): string[];
export function temporalCatalogueFindings(files: readonly string[], read?: ReadText): string[];
export interface RuntimeTemporalCount {
  file: string;
  name: string;
  count: number;
}
export interface RuntimeTemporalDifference extends RuntimeTemporalCount {
  kind: 'new' | 'stale';
}
export function runtimeTemporalCounts(files: readonly string[], read?: ReadText): RuntimeTemporalCount[];
export function compareRuntimeTemporalCounts(
  observed: readonly RuntimeTemporalCount[],
  baseline: readonly RuntimeTemporalCount[],
): RuntimeTemporalDifference[];
export function lint(): boolean;
