declare const __DEADVOX_BUILD_REVISION__: string;

export const getBuildRevision = (): string => {
  try {
    return __DEADVOX_BUILD_REVISION__;
  } catch {
    // The define is absent when the module runs unbundled; the sentinel shows in the build label.
    return 'unavailable';
  }
};
