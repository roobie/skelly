export { getBuildRevision } from './core/buildInfo.ts';
export { buildRevisionFromGit } from './core/buildRevision.ts';
export { type BundleStamp, bundleSourceHash } from './core/bundleAdmission.ts';
export {
  admitPacks,
  type PackInput,
  type PackManifest,
  PackManifestSchema,
  packContentHash,
  packStartIssues,
} from './core/packAdmission.ts';
export {
  declaredAsset,
  logicalKey,
  type PackFileEntry,
  type PackLocation,
  resolvePhysical,
} from './core/packFiles.ts';
export { TEMPORAL_FIELDS } from './core/temporalFields.ts';
