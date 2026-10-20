import { canonicalJson } from './canonicalJson.ts';
import type { ContentSource } from './content.ts';

export interface BundleStamp {
  sourceHash: string;
  proofHash: string;
}

const HASH = /^[0-9a-f]{64}$/;
const sourceKey = (sources: readonly ContentSource[]): string =>
  canonicalJson(sources.map(({ source, data }) => [source, data]));
const digest = async (key: string): Promise<string> => {
  const bytes = new TextEncoder().encode(key);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const bundleSourceHash = (sources: readonly ContentSource[]): Promise<string> => digest(sourceKey(sources));

/** A matched stamp certifies only this ordered input, never a later mod or mutated source. */
export class BundleAdmission {
  private readonly key: string;

  private constructor(key: string) {
    this.key = key;
  }

  static async prepare(
    sources: readonly ContentSource[],
    stamp: BundleStamp | undefined,
    proofHash: string | undefined,
  ): Promise<BundleAdmission | undefined> {
    if (
      !(
        stamp &&
        proofHash &&
        HASH.test(stamp.sourceHash) &&
        HASH.test(proofHash) &&
        stamp.proofHash === proofHash &&
        globalThis.crypto?.subtle
      )
    ) {
      return undefined;
    }
    try {
      const key = sourceKey(sources);
      return (await digest(key)) === stamp.sourceHash ? new BundleAdmission(key) : undefined;
    } catch {
      // Invalid or unsupported source data must still get normal admission diagnostics.
      return undefined;
    }
  }

  matches(sources: readonly ContentSource[]): boolean {
    try {
      return this.key === sourceKey(sources);
    } catch {
      return false;
    }
  }
}
