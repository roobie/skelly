export { getBuildRevision } from './core/buildInfo.ts';
export { buildRevisionFromGit } from './core/buildRevision.ts';
export { BundleAdmission, type BundleStamp, bundleSourceHash } from './core/bundleAdmission.ts';
export {
  admitPacks,
  admitWithFolderPacks,
  type PackInput,
  type PackManifest,
  PackManifestSchema,
  packContentHash,
  packStartIssues,
  selectFolderClosure,
} from './core/packAdmission.ts';
export {
  declaredAsset,
  logicalKey,
  type PackFileEntry,
  type PackLocation,
  resolvePhysical,
} from './core/packFiles.ts';
export { TEMPORAL_FIELDS } from './core/temporalFields.ts';
