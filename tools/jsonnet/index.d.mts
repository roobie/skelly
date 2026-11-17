export const REPOSITORY_ROOT: string;
export const JSONNET_VERSION: string;
export function compileJsonnetFile(sourcePath: string, repositoryRoot?: string): string;
export function evaluateJsonnetFile(sourcePath: string, repositoryRoot?: string): Promise<string>;
export function jsonnetDependencies(
  sourcePath: string,
  repositoryRoot?: string,
  fallbackPaths?: string[],
): Promise<string[] | null>;
export function runProcess(
  executable: string,
  args: string[],
  options?: { cwd?: string; input?: string },
): Promise<string>;
