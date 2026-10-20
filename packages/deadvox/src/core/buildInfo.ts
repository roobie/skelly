declare const __DEADVOX_BUILD_REVISION__: string;

export const getBuildRevision = (): string => {
  try {
    return __DEADVOX_BUILD_REVISION__;
  } catch {
    return 'unavailable';
  }
};
