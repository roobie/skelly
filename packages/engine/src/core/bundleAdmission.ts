import { SHA256_HEX } from './canonicalJson.ts';
import type { ContentSource } from './content.ts';
import { contentDigest as digest, contentSourceKey as sourceKey } from './contentHash.ts';
import { type PackInput, packSources } from './packAdmission.ts';

export interface BundleStamp {
  sourceHash: string;
  proofHash: string;
}

export const bundleSourceHash = (sources: readonly ContentSource[]): Promise<string> => digest(sourceKey(sources));

/** A matched stamp certifies only this ordered input, never a later mod or mutated source. */
export class BundleAdmission {
  private readonly key: string;

  private readonly intact: () => boolean;

  private constructor(key: string, intact: () => boolean = () => true) {
    this.key = key;
    this.intact = intact;
  }

  static async preparePack(
    pack: PackInput,
    stamp: BundleStamp | undefined,
    proofHash: string | undefined,
  ): Promise<BundleAdmission | undefined> {
    const inputs = () => [{ source: 'pack', data: pack.manifest }, ...pack.files];
    const matched = await BundleAdmission.prepare(inputs(), stamp, proofHash);
    if (!matched) {
      return undefined;
    }
    return new BundleAdmission(sourceKey(packSources(pack)), () => matched.matches(inputs()));
  }

  static combine(
    packs: readonly { pack: PackInput; admission: BundleAdmission | undefined }[],
  ): BundleAdmission | undefined {
    if (packs.some(({ admission }) => !admission)) {
      return undefined;
    }
    return new BundleAdmission(sourceKey(packs.flatMap(({ pack }) => packSources(pack))), () =>
      packs.every(({ pack, admission }) => admission!.matches(packSources(pack))),
    );
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
        SHA256_HEX.test(stamp.sourceHash) &&
        SHA256_HEX.test(proofHash) &&
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
      return this.intact() && this.key === sourceKey(sources);
    } catch {
      return false;
    }
  }
}
