export function analyzeFiles(files: string[], read?: (path: string, encoding: string) => string): string[];
export function temporalNameFindings(file: string, text: string, mode?: 'source' | 'json' | 'catalogue'): string[];
export function mixedArithmeticFindings(file: string, text: string): string[];
export function lint(): boolean;
