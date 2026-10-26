import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { loadGunDesign } from '../gun/designLoader.ts';

export interface DesignCheckResult {
  readonly exitCode: 0 | 1;
  readonly lines: readonly string[];
}

/** Checks whether each supplied design can be loaded and whether published files are clean. */
export const checkDesignFiles = (files: readonly string[]): DesignCheckResult => {
  let failed = false;
  const lines = files.map((file) => {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch (error) {
      failed = true;
      return `FAIL ${basename(file)}: ${error instanceof Error ? error.message : String(error)}`;
    }
    const result = loadGunDesign(text);
    if (!result.ok) {
      failed = true;
      return `FAIL ${basename(file)}: ${result.error.code}: ${result.error.message}`;
    }
    if (result.declaredStatus === 'published' && result.issues.length > 0) {
      failed = true;
      return `FAIL ${basename(file)}: published design has ${result.issues.length} issue(s): ${result.issues.map(({ message }) => message).join('; ')}`;
    }
    return `PASS ${basename(file)}${result.issues.length > 0 ? `: draft has ${result.issues.length} issue(s)` : ''}`;
  });
  return { exitCode: failed ? 1 : 0, lines };
};
