---
read_if:
  - you rely on the runtime closure check to prove the runtime reaches nothing outside the runtime set
  - you rely on the no-DOM typecheck or the runtime's browser-name lint ban to keep browser APIs out of the runtime
  - you change the closure check, the Vite config, a deadvox tsconfig or a workspace manifest
  - a reviewer reports a route around the closure check and you need to know whether it is already accepted
tags: [deadvox, refactor, testing, tooling]
---

# Runtime closure check: limits

The closure check (`tools/runtimeClosure.ts`, `runtimeClosureViolations`, and the Vite gate in
`test/runtimeClosure.test.ts`, `viteGateIssues`), the no-DOM typecheck
(`tsconfig.runtime.json`) and the browser-name lint ban (`biome.jsonc`, `noRestrictedGlobals`)
exist to catch honest mistakes: a contributor who adds an import, a
glob, a manifest field, a tsconfig option, a symlink or a Vite root that lets the runtime reach
presentation or product code, or who uses a browser API in the runtime. They do not defend
against a deliberate bypass. Closing every
deliberate route would mean re-implementing tsc and Vite resolution inside the check, with each gap
adding code to the check for little gain, so the known gaps are listed here instead of closed.
Anything the check does not model fails closed; the items below are routes it accepts or never
sees.

## Not checked

- **Plugins that change themselves:** a plugin hook added inside `configResolved` or any later hook
  escapes the gate, which reads hooks only after awaiting the plugin option; a contributor does not
  write this by accident.
- **Code injected by `transform` or `load`:** a plugin can replace a module's source or serve a
  virtual module; the check reads files on disk, and plugins exist to transform code, so their
  output is reviewed as code, not closed by the check.
- **Plugin hooks other than config and id resolution:** hooks such as `buildStart` can mutate shared
  state that resolution reads later; modelling every hook is the Vite re-implementation this check
  avoids.
- **Browser names a later `@types/node` declares:** the no-DOM typecheck compiles the runtime set
  with the ES libraries and Node's types, so a DOM-only name such as `document` fails, but a
  browser name that `@types/node` declares as a Node global compiles. The lint ban
  (`biome.jsonc`, `noRestrictedGlobals`, on the runtime set's paths) fails the ones it names;
  a name a later `@types/node` upgrade adds passes both checks until it is added to the ban.
- **Vite runs started outside the package:** an absent Vite `root` is the working directory, which
  the package's scripts set to the policy root; a run from another directory or with a CLI root
  flag is not seen.
- **Vite settings outside `resolve`, `root` and plugins:** per-environment resolution, SSR
  resolution and worker plugins are not compared with the policy; the real config sets none that
  redirect imports.
- **Vite configs for other commands, modes or environment variables:** the gate loads the config
  once for each command the package's scripts run (`test/runtimeClosure.test.ts`,
  `packageCommands`); a custom `--mode`, `vite preview` and Vitest's test mode are not loaded.
  Environment variants are not enumerated either, including ones a package script selects (the
  HTTPS development script in `package.json`, `scripts`, and its branch in `vite.config.ts`,
  `basicSsl`): each load takes only the branch the test's inherited environment picks. These are
  accepted because the combinations are unbounded.
- **`publicDir` as a root-relative URL:** a `/` specifier that only the public directory supplies
  is not compared, because Vite refuses to import code or JSON through that lookup; an ordinary
  relative or absolute import of a file inside the public directory is a module edge and is checked
  by its path like any other.
- **Non-module reach:** code fetched or evaluated at run time, globals that presentation code
  registers, and data files that name presentation modules are not imports, so the check never sees
  them; it guards module edges only.
- **Insides of npm packages:** a package that is neither a workspace nor named in
  `RUNTIME_POLICY`, `forbiddenPackages` is a leaf, so what it imports is not walked. Its DOM use is
  not caught by either check: the no-DOM typecheck inherits `skipLibCheck`, so it reads neither the
  package's JavaScript nor errors in its declarations, and a declaration typed with a DOM type such
  as `HTMLElement` still compiles in runtime code that imports it. Local source files in the
  runtime set are always followed, except under a directory `RUNTIME_POLICY`, `leaves` names.
- **Negated glob patterns:** skipped, so the check matches more than Vite does; this over-reports
  and never hides an edge.

## Known unknowns

- **Future Vite and tsc resolution:** the check models the installed versions' resolution; a new
  option, condition or import form in a later release may resolve where the check does not look,
  and nothing re-audits the check on a toolchain upgrade.
- **npm package resolution rules:** conditions, `exports` patterns and `typesVersions` inside npm
  packages were not audited, because those packages are leaves.
- **Parser coverage of new syntax:** edges come from the Oxc syntax tree (`syntaxEdges`); a new import
  syntax the parser represents differently may not be read as an edge.
- **Case-insensitive filesystems:** the check was audited on a case-sensitive filesystem only; a
  specifier whose case differs from the file may resolve on another host.
