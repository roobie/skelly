// biome-ignore lint/correctness/noNodejsModules: This gate loads Vite configs in Node.js.
import { dirname, resolve } from 'node:path';
import { type ConfigEnv, loadConfigFromFile, type UserConfig } from 'vite';

const resolutionHooks = new Set(['config', 'configEnvironment', 'resolveId']);

/** Vite awaits and flattens the plugin option; so does the gate before it reads hooks. */
async function settledPlugins(option: unknown): Promise<unknown[]> {
  const settled = await option;
  return Array.isArray(settled) ? (await Promise.all(settled.map(settledPlugins))).flat() : [settled];
}

/**
 * What in a loaded Vite config could resolve differently from the closure check: any resolution option, a
 * root other than the package root (it anchors `/` specifiers and globs), or a plugin hook that edits config or
 * resolves ids. See `packages/deadvox/docs/runtime-closure-limits.md`.
 */
export async function viteGateIssues(config: UserConfig, packageRoot: string): Promise<string[]> {
  const issues: string[] = [];
  if (config.resolve !== undefined) {
    issues.push('resolve');
  }
  // An absent root is the working directory, which the package's scripts set to the package root.
  if (config.root !== undefined && resolve(packageRoot, config.root) !== packageRoot) {
    issues.push('root');
  }
  for (const plugin of await settledPlugins(config.plugins ?? [])) {
    if (plugin && typeof plugin === 'object') {
      issues.push(...Object.keys(plugin).filter((hook) => resolutionHooks.has(hook)));
    }
  }
  return issues;
}

// The package's scripts run `vite` (serve, development) and `vite build` (build, production); a config
// function may answer each differently, so each is gated.
const packageCommands: readonly ConfigEnv[] = [
  { command: 'build', mode: 'production' },
  { command: 'serve', mode: 'development' },
];

/**
 * The gate's issues for each package command's config loaded from `configFile`, which sits at its package
 * root, prefixed by the command. The loaded config is gated, not the file's text, because a config file may
 * compute its values.
 */
export async function configFileGateIssues(configFile: string): Promise<string[]> {
  const packageRoot = dirname(configFile);
  const perCommand = await Promise.all(
    packageCommands.map(async (env) => {
      const loaded = await loadConfigFromFile(env, configFile, packageRoot, 'silent');
      const found = loaded === null ? ['no config'] : await viteGateIssues(loaded.config, packageRoot);
      return found.map((issue) => `${env.command}: ${issue}`);
    }),
  );
  return perCommand.flat();
}
