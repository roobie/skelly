export function analyzeFiles(files: string[], read?: (path: string, encoding: string) => string): string[];
export function temporalNameFindings(file: string, text: string, mode?: 'source' | 'json' | 'catalogue'): string[];
export function mixedArithmeticFindings(file: string, text: string): string[];
export interface RuntimeTemporalCount {
  file: string;
  name: string;
  count: number;
}
export interface RuntimeTemporalDifference extends RuntimeTemporalCount {
  kind: 'new' | 'stale';
}
export function runtimeTemporalCounts(
  files: string[],
  read?: (path: string, encoding: string) => string,
): RuntimeTemporalCount[];
export function compareRuntimeTemporalCounts(
  observed: RuntimeTemporalCount[],
  baseline: RuntimeTemporalCount[],
): RuntimeTemporalDifference[];
export function lint(): boolean;
