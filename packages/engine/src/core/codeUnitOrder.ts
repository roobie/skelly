/**
 * The one string order for anything that reaches a save, a bundle stamp, content order or simulation choices: by
 * UTF-16 code unit, so locale and platform never reorder it. `localeCompare` follows the runtime's collation, which
 * differs between a build machine and a browser.
 */
export const compareCodeUnits = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  return left > right ? 1 : 0;
};
