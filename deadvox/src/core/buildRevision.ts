export type GitDescribe = (args: readonly string[]) => string;

export function buildRevisionFromGit(runGit: GitDescribe): string {
  return runGit(['describe', '--always', '--dirty', '--abbrev=40']).trim();
}
