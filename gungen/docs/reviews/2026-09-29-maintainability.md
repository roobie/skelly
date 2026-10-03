# gungen maintainability review

Repo: the repository root, project `gungen/`, HEAD `efd3e9f` (main), 2026-09-29. Read-only review; nothing in the repo was changed.

## 0. Derived inputs

All four inputs were DERIVED from `gungen/PROJECT.md` (the only markdown in `gungen/`) plus the root `README.md`.

**Lifespan: will evolve** (DERIVED). The doc describes the project as changing shape rather than being thrown away or finished:

> "It began as a procedural generator; from Milestone 3 it is a designer tool, with the generator kept as a variant suggester."

> "§1–§3 are the first milestone. Together they form one design: a port schema, a keep-out volume schema, and feasibility rules written against both. They are hard to change once parts are authored against them. Everything after that can change later."

> "after 3.5: attachments with game properties and port compatibility (gungen.2), with the deadvox schema change they need."

The root README frames the whole repo as "A greenfield, experimental, multi-modal 3D project", which argues against "long-lived" in the infrastructure sense. Assumption used: *will evolve*, so this report does both refactor findings (B) and the knowledge check (C).

**Changes expected next** (DERIVED from "Milestone 3: the designer", work packages 3.0–3.6):

1. **3.0 Contracts — design file format, prefabs, hold anchors, palette, port metadata.** > "A versioned `format` field, plus: `template` …; `locks` …; prefab references; `status`: `draft` or `published`" and > "Loading is a runtime parse, not a type assertion. A malformed file fails to parse. Unknown format versions are refused." Also > "Hold anchors. Part families declare named anchors in gun-domain data, not in core." and > "Palette. One table of family colours … shared by the viewer and the export."
2. **3.4 glTF export** built on `mesh.ts`: > "A pure `src/core` writer for `.glb`, with no three.js, built on `mesh.ts`: the same solids the viewer draws (`displaySolids ?? solids`) and the shared palette … one node per part, named by part id and family".
3. **3.3 Variant suggester**: > "`suggest(design, template, domain, seed, n, budget)`, a pure core function: re-rolls only unlocked params and unlocked optional parts, within the template's choices."
4. **3.6 Vocabulary**: > "trigger guards on every archetype (gungen.3, in progress)"; > "the octagonal barrel as a barrel profile param (gungen.7)"; > "trapezoidal side profiles for stocks and pistol grips … Keep port positions, `hold` anchors, magazine-well clearance, the stock's `FIRING_GRIP` role, and every existing rule passing"; > "visible action details … charging handles, ejection ports, bolt handles"; > "per-solid opt-out of bevels and outlines".

**Boundaries**: projects are independent on purpose (given). Confirmed in code: no import in `gungen/src` or `gungen/test` leaves `gungen/`; `mobgen/src/viewer/scene.ts` mentions gungen only in a comment. One deliberate cross-project pin exists and is already tested: `site/index.html` hand-copies gungen's template and fixture names and `test/site-launcher.test.mjs` ("lists the current gungen templates and fixtures") fails when they drift. Not a finding.

**Main maintainer: both** (given). The plan itself assigns lanes to "coder@gungen", "subagent" and "coder@main".

## 1. History (method step 1)

`git log --merges --first-parent -- gungen` gives 12 merges (all of main's gungen history; there are no plain first-parent commits):

| Merge | PR | Code files touched (excl. md, lockfile, snapshots) | Feature size vs. touch |
| --- | --- | --- | --- |
| b9d192f | #59 gungen-tweaks (trigger guards) | 8 + 1 fixture | parts.ts +124/−60, gun/rules.ts +137, new triggerGuard.test.ts, 4 other tests edited |
| c94683c | #58 designer-plan | PROJECT.md only | — |
| 7cb2e9b | #55 designer-plan | PROJECT.md only | — |
| 45a38b7 | #57 mesh-snapshot-refresh | 1 snapshot | fix-only PR (see below) |
| 221d11e | #51 param-panel | 7 | new paramPanel.ts (362) + main.ts +281; proportional |
| 194bb60 | #52 mesh-bevel | 7 | new mesh.ts (220) + scene.ts, cli; proportional |
| 3420e49 | #53 gungen-tweaks (size bands, crown) | 10 | parts.ts, gun/rules.ts, templates.ts + 5 tests + generate snapshot |
| e61f96b | #49 gungen-tweaks | 62 files, +6534/−415 | 27 commits: Milestones 2.1, 2.2, 2.3 and half of the size-band work in one PR |
| b2dc34a | #30 thicker-magazines | 3 | parts.ts +51; 2 tests re-pinned |
| e31539a | #4 Biome adoption | 23 | bulk lint fix; excluded from churn |
| 5a005d4 | #2 templates + generator | 13 | new files; proportional |
| 695753e | #1 Milestone 1/1.1/1.2 | 46 | initial |

Because #49 bundles three milestones and #4 is a bulk-format commit, PR granularity is too coarse for "files touched by most changes". Non-merge commits (53) were used instead:

**(a) Files touched by most changes** (of 53 non-merge commits): `src/gun/parts.ts` 31, `src/gun/templates.ts` 15, `test/rules.test.ts` 14, `test/parts.test.ts` 13, `src/gun/rules.ts` 13, `test/resolve.test.ts` 10, `test/fixtures.test.ts` 9, `src/viewer/scene.ts` 9, `src/viewer/main.ts` 9, `src/gun/domain.ts` 9. `parts.ts` (1744 lines) is touched by 58 % of all commits whatever the feature; the plan's own "one writer at a time per hot file" list names the same files.

**(b) Features that needed follow-up fixes, and why**

- **Mesh bevel (#52) → #57 `ae9f5f2` "refresh the mesh test's validator-count snapshot"**. Its message: "#52 recorded ar at 43/60 valid (26 distinct) from main before #53 landed. #53's free-float fix makes it 60/60 (20 distinct), so main's gungen tests and the Pages build failed on the stale snapshot. The mesh module is unchanged; only generator counts moved." A test in `mesh.test.ts` pins generator counts, so a parts change in another PR broke main. → B2.
- **Trigger guards (#59)**: inside the PR, `7522489` "WIP" → `069a911` "scale lower trigger guards to review" → `a33684a` "allow the AR guard validation sweep" (bumps `generate.test.ts` timeout: "AR's 300-seed sweep now exercises the geometry-heavy trigger-guard rule on every build") → `5c0ea15` "check trigger-guard ratios across layouts". The lower had to learn where the grip's front face is (`lowerGripContactX`) so the guard's rear wall touches it. → B1, B8.
- **Mesh bevel (#52)** internal fix `480e473` "weld the chamfered mesh's faces": "each cap-perimeter chamfer face used a point on the original profile edge … That left every cap-adjacent seam unwelded". Fixed within the PR with a watertightness test; no follow-up on main. Not a finding.
- **AK archetype (#49)** internal fixes `1facf6f` "correct AK magazine prism geometry", `3c789ef` "align magazine housing front wall", `bf8c23f` "Revert stepped grip bevel workaround": all geometry adjustments in `parts.ts` after visual review, each re-pinning goldens in tests and the generate snapshot. The snapshot file changed in 14 commits over five days.
- **Handguns (#49)** `bdae87a` "tighten and validate handgun assemblies" added the `connection-contact` core rule after "Visual review found the slide/barrel ports aligned while their solids were 2.24u apart" (PROJECT.md). A rule added because a port graph could hide separated solids. The rule is in `CORE_RULES` but not in `CORE_RULE_IDS` (see C).

Reliability note: "next few commits on the same files" was useless here — every follow-up fix either lives inside the same PR (squashed history) or in a one-commit fix PR whose message names the cause. I used commit messages (fix/correct/revert/allow/refresh/WIP) plus `git show` of each candidate.

## 2. Tracing the expected changes (method step 2)

**Change 1 — 3.0 contracts.**
Files: `src/core/schema.ts` (`Assembly`, `PartInstance`; `PartDef` if anchors become a field), every place that turns JSON into an `Assembly` (five typed casts + one untyped parse, B5), `src/gun/parts.ts` (anchors per family), `src/viewer/scene.ts` (`FAMILY_COLORS` → palette, B6), `src/viewer/paramPanel.ts` (locks vs. the current "compare against seed" inference), `test/__snapshots__/generate.test.ts.snap` (30 snapshotted assemblies gain a `format` field if `generate()` emits one), `fixtures/*.json` (31 files).
Invariants: `fixtures.test.ts` requires every archetype fixture to `expect: []` and to pass; the site launcher test pins fixture names; `paramPanel.setSlotPresent` assumes part id === template slot id (`slotId in assembly.parts`) — true for every archetype fixture today (checked), but nothing tests it. "Family" means three different strings (B3).
Silent breakage: a loader left on `JSON.parse(...) as Assembly` accepts unversioned files the others refuse; a family with no palette entry renders grey and the planned "colours match the palette" test passes (B6); a prefab keyed by `PartDef.family` = `'receiver'` is offered to both `receiver` and `ak-receiver`, whose param sets differ (B3).

**Change 2 — 3.4 glTF export.**
Files: new `src/core/export*.ts`, `src/core/mesh.ts` (unchanged API `meshForSolid(solid, bevel)`), `src/core/resolve.ts` (`Resolved.placed` transforms `{r: Mat3, t: Vec3}`), palette, anchors, `package.json`/CI (gltf-validator).
Invariants: `displaySolids ?? solids` convention (`scene.ts:124`, `mesh.test.ts`); the 5000-triangle budget in `mesh.test.ts`; unit 1u ≈ 11.5 mm (PROJECT.md, `mesh.ts`) versus `conventions.ts` "1 u is roughly a centimetre" (C).
Silent breakage: grey fallback colours (B6); `PartDef.family` vs registry key in node names (B3).

**Change 3 — 3.3 suggester.**
Files: new `src/core/suggest.ts` using `generate.ts`/`template.ts`/`random.ts`; `paramPanel.ts` later.
Invariants: `generate()` draws from one sequential RNG in template order (B7) — a suggester that "re-rolls only unlocked params" cannot reuse `generate()`'s stream without re-drawing everything; `chooseParam` resolves `ParamReference`s from already-chosen slots in order; `when` on connections; `permittedValues` treats a param the template doesn't mention as unrestricted (B4), so "within the template's choices" is undefined for such params.
Silent breakage: suggestions that set fault-injection values (`fit: 'too-tight'`, `triggerGuard: 'missing'`) if "family values" rather than "template values" are used (B4).

**Change 4 — 3.6 vocabulary (trapezoidal grips/stocks, octagonal barrel, action details, display hints).**
Files: `src/gun/parts.ts` (grip profile, stock solids, barrel), `src/gun/rules.ts` (`trigger-guard`), `src/gun/templates.ts` (new param choices), `test/triggerGuard.test.ts` (bit-identical goldens), `test/parts.test.ts` (grid test exempts `trigger-guard-*`), generate snapshots.
Invariants: the lower positions its guard's rear wall from the grip's constants (B1) and the rule demands 1e-8 contact; the rule accepts only box guards with a 0.25u vertical wall (B8); `PartDef.solids` must be convex (`validateExtrudedPolygon`), so a thumbhole or concave taper is several solids; the `keep-out` rule exempts the owner (`const allowed = new Set([owner])`, documented in the plan); adding a template choice shifts later RNG draws (B7).
Silent breakage: none silent — these fail as rule failures across every template's sweep tests, which is the cost: each vocabulary change forces lockstep edits in `parts.ts`, `gun/rules.ts` and the tests.

## A. Checks to add

Each is enforceable automatically. Node modules are not installed in this checkout, so the Biome snippet could not be validated against the installed schema (`node_modules/@biomejs/biome/configuration_schema.json` is absent); the vitest checks need only what the suite already uses.

**A1. Import boundaries (test).** Pins: gungen imports nothing outside `gungen/`; `src/core` imports neither `src/gun`, `src/viewer` nor `three`; the validator path (`validate.ts`, `rules.ts`, `resolve.ts`, `geometry.ts`) does not import `mesh.ts` (this is the property `mesh.test.ts`'s snapshot claims to check — see B2). Add as `gungen/test/imports.test.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
const IMPORT = /^\s*(?:import|export)[^'"]*from\s+['"]([^'"]+)['"]/gm;
const imports = (file: string): string[] =>
  [...readFileSync(file, 'utf8').matchAll(IMPORT)].map((m) => m[1]!);

describe('import boundaries', () => {
  const files = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'test'))];

  it('never imports a sibling project or anything above gungen/', () => {
    for (const file of files) {
      for (const spec of imports(file).filter((s) => s.startsWith('.'))) {
        const target = relative(ROOT, resolve(file, '..', spec));
        expect(target.startsWith('..'), `${relative(ROOT, file)} imports ${spec}`).toBe(false);
      }
    }
  });

  it('keeps src/core free of gun data, the viewer and three.js', () => {
    for (const file of walk(join(ROOT, 'src', 'core'))) {
      for (const spec of imports(file)) {
        expect(spec, `${relative(ROOT, file)} imports ${spec}`).not.toMatch(/(^|\/)(gun|viewer)\/|^three/);
      }
    }
  });

  it('keeps the validator path independent of the mesh module', () => {
    for (const name of ['validate.ts', 'rules.ts', 'resolve.ts', 'geometry.ts']) {
      expect(imports(join(ROOT, 'src', 'core', name))).not.toContain('./mesh.ts');
    }
  });
});
```

**A2. Same boundary in Biome** (`biome.jsonc`, `overrides`), to be confirmed against the installed schema — Biome 2's `style/noRestrictedImports` takes `paths` and, in recent 2.x, `patterns`:

```jsonc
{
  "includes": ["**/gungen/src/**", "**/gungen/test/**"],
  "linter": {
    "rules": {
      "style": {
        "noRestrictedImports": {
          "level": "error",
          "options": {
            "patterns": [
              { "group": ["**/deadvox/**", "**/mobgen/**", "**/site/**"], "message": "gungen is independent of its sibling projects." }
            ]
          }
        }
      }
    }
  },
  {
    "includes": ["**/gungen/src/core/**"],
    "linter": { "rules": { "style": { "noRestrictedImports": { "level": "error", "options": {
      "paths": { "three": "src/core has no rendering dependency (PROJECT.md decisions)." },
      "patterns": [{ "group": ["../gun/**", "../viewer/**"], "message": "core stays domain-agnostic." }]
    } } } } }
  }
}
```

**A3. Rule-id registry matches the rule list.** `CORE_RULE_IDS` (`issue.ts`) lacks `'connection-contact'` although `CORE_RULES` (`rules.ts`) contains `connectionContact`; `fixtures.test.ts` derives "a broken fixture for every core rule" from `CORE_RULE_IDS`, which is why `broken-connection-contact.json` lives in `test/fixtures/` with no `expect`. Add to `test/rules.test.ts`:

```ts
it('CORE_RULE_IDS lists exactly the core rules plus "structure"', () => {
  expect([...CORE_RULE_IDS].sort()).toEqual(['structure', ...CORE_RULES.map((r) => r.id)].sort());
});
```
(This fails today; fixing it also makes `fixtures.test.ts` demand a real `fixtures/broken-connection-contact.json`.)

**A4. Palette covers every family** (supports B6 and the 3.0 palette move). Once the palette is its own module (say `src/gun/palette.ts`, exporting `FAMILY_COLORS`):

```ts
import { FAMILIES } from '../src/gun/parts.ts';
import { FAMILY_COLORS } from '../src/gun/palette.ts';

it('has a colour for every family a part can report', () => {
  const defaults = (f: PartFamily) =>
    Object.fromEntries(Object.entries(f.params).map(([k, spec]) => [k, spec.default]));
  const reported = new Set(Object.values(FAMILIES).map((f) => f.build(defaults(f)).family));
  for (const family of reported) {
    expect(FAMILY_COLORS, family).toHaveProperty(family);
  }
});
```

**A5. Family naming pinned** (supports B3). Until a decision is made, pin the current triple so any change is deliberate:

```ts
it('registry key, family name and PartDef.family agree, except the documented role aliases', () => {
  const triples = Object.entries(FAMILIES).map(([key, f]) => [key, f.name, f.build(defaults(f)).family]);
  const aliases = triples.filter(([key, name, role]) => key !== name || key !== role);
  expect(aliases).toEqual([
    ['ak-receiver', 'receiver', 'receiver'],
    ['ak-rear-sight', 'ak-rear-sight', 'sight'],
  ]);
});
```

**A6. Fault-injection values are never design vocabulary** (supports B4). Today, as data:

```ts
const FAULT_VALUES: Record<string, string[]> = {
  'handguard.fit': ['oversized', 'too-tight'],
  'cylinder.chamber': ['misaligned'],
  'lower.triggerGuard': ['missing'],
  'frame.triggerGuard': ['missing'],
};
it('no template can choose a fault value', () => {
  for (const t of TEMPLATES) for (const slot of t.slots)
    for (const [name, c] of Object.entries(slot.params ?? {})) {
      const faults = FAULT_VALUES[`${slot.family}.${name}`] ?? [];
      for (const v of Array.isArray(c) ? c : typeof c === 'string' ? [c] : []) expect(faults).not.toContain(v);
    }
});
```
With a `ParamSpec.fault?: readonly string[]` field (B4's remedy) the table moves into `parts.ts` and the panel/suggester read it.

**A7. Fixture ids match template slot ids** (the panel's Add/Remove feature keys on slot id; 3.5 says "a fixture can stand in for the design"):

```ts
it('archetype fixtures use their template\'s slot ids', () => {
  for (const f of fixtures.filter((f) => f.name.startsWith('archetype-'))) {
    const t = TEMPLATES.find((t) => f.name === `archetype-${t.name}` || f.name.startsWith(`archetype-${t.name}-`));
    expect(t, f.name).toBeDefined();
    const slots = new Set(t!.slots.map((s) => s.id));
    for (const id of Object.keys(f.parts)) expect(slots, `${f.name}.${id}`).toContain(id);
  }
});
```

**A8. Doc citations by symbol, not line.** PROJECT.md cites `src/gun/parts.ts:1268`, `:1652`, `:927-963`, `:1641-1672`, `:266-288`, `:1405-1409`; all six are already stale after #59 (see C). Replace with symbol names and pin them:

```ts
it('PROJECT.md cites symbols that exist', () => {
  const doc = readFileSync(join(ROOT, 'PROJECT.md'), 'utf8');
  for (const [, file, symbol] of doc.matchAll(/`(src\/[\w/.-]+\.ts)#(\w+)`/g)) {
    expect(readFileSync(join(ROOT, file!), 'utf8'), `${file}#${symbol}`).toMatch(new RegExp(`\\b${symbol}\\b`));
  }
});
```

**A9. Size budget.** `noExcessiveLinesPerFile` is deliberately off in `biome.jsonc`; I would not re-enable it. The one budget worth stating is already there (`TRIANGLE_BUDGET = 5000` in `mesh.test.ts`). A validation-time budget would serve 3.2/3.3 but could not be measured in this checkout (E).

## B. Judgement findings

None of the eight was refuted by its verifier; B4, B7 and B8 were narrowed to what the verifier confirmed.

### B1 `gungen/src/gun/parts.ts#lowerGripContactX/duplicated-grip-geometry` — effort M

```ts
const lowerGripContactX = (layout: string, gripXOverride?: number): number => {
  const gripX = gripXOverride ?? LOWER_GRIP_X[layout as keyof typeof LOWER_GRIP_X] ?? LOWER_GRIP_X.conventional;
  return gripX + 1.5 * Math.cos((GRIP_BANDS.leanDegrees * Math.PI) / 180);
};
```
and in `gun/rules.ts`:
```ts
    if (gap > 1e-8 || penetration > 1e-8) {
      return `${part}'s rear trigger-guard wall must contact ${gripPart} without a gap or overlap.`;
```
The `lower` builds its guard's rear wall so that it touches the *grip family's* front vertex (grip-local `[1.5, 0]`, rotated by `GRIP_BANDS.leanDegrees`) — a hand-copied constant, since `lower.build(params)` cannot see the connected part. The rule then demands contact at 1e-8 (core tolerances are 1e-6 and 0.25u). Verifier confirmed the mapping: grip-local `[1.5,0]` lands at `(gx + 1.5·cos a, −1.5 − 1.5·sin a)`, exactly the wall's outer X; a `well: 'magazine'` grip (front vertex at 2.25) would penetrate the wall by ~0.71u — nothing says such a grip may never hang from a lower.
**Past cost:** PR #59 needed four commits (WIP → scale → "allow the AR guard validation sweep" → ratios) to make guards fit every layout. **Planned change:** 3.6 "trapezoidal side profiles for … pistol grips … raked, with slanted front and back faces" with "every existing rule passing" — moving the grip's front vertex fails `trigger-guard` on every template that connects `lower.grip` (battle-rifle, ar, ak, smg, bolt-rifle-box, bullpup, revolver, 30 % of pump-shotgun seeds). It fails loudly in `triggerGuard.test.ts`, but as a rule failure whose cause is two constants in another family.
**Remedy:** let the rule, not the builder, own contact: give the rear wall a fixed thickness (`innerRearX - sideWall`, as the pistol frame does) and relax the grip check to `TOLERANCE.connectionContact` (0.25u, the same allowance every connection already gets). If exact touch is wanted, export one constant from the grip (`GRIP_FRONT_TOP: Vec2`) and have `lowerGripContactX` rotate *that*, so a grip profile change moves both.

### B2 `gungen/test/mesh.test.ts#validator-results-unchanged-snapshot` — effort S

```ts
describe('validator results are unchanged by the mesh module (display-only)', () => {
  it('per-template valid/distinct counts over a seed sweep match the recorded baseline', () => {
    ...
        if (validate(a, gunDomain).ok) {
          valid += 1;
        }
    ...
    expect(summary).toMatchSnapshot();
```
The body never calls `mesh.ts`; it pins generator/validator counts, which move whenever `parts.ts`, `templates.ts` or a rule changes. Verifier confirmed only `scene.ts` and `cli/mesh-stats.ts` import `mesh.ts`, so the named property is a static import fact.
**Past cost:** #57 `ae9f5f2` — main and the Pages deploy were red for ~40 minutes after #53 merged, fixed by regenerating this snapshot ("The mesh module is unchanged; only generator counts moved").
**Remedy:** delete the describe block and its snapshot; keep the property with A1's third test. `generate.test.ts` already covers valid rates as a threshold (≥ 50 % over 300 seeds), which is the robust form.

### B3 `gungen/src/gun/parts.ts#FAMILIES/three-names-per-family` — effort S now, M later

```ts
export const akReceiver: PartFamily = {
  name: 'receiver',
  ...
export const akRearSight: PartFamily = {
  name: 'ak-rear-sight',
  params: {},
  build(): PartDef {
    return {
      family: 'sight',
```
A family has a registry key (what assembly files and templates say), a `PartFamily.name`, and a `PartDef.family`. For `ak-receiver` the last two are `'receiver'`; for `ak-rear-sight` the last is `'sight'`. Verifier mapped consumers: rules (`handguardFit`, `feedMatch`, `pistolBarrelCrown`, `freeFloatClearance`, `magazineWellAxis`) and the palette match on `PartDef.family`; `resolve`, `generate`, the panel and templates use the key; `.name` appears only in one error string and test labels. No comment or test states which is authoritative. This is deliberate (an AK *is* a receiver for the rules) but undocumented.
**Planned change:** 3.0/3.1/3.4 say "prefabs of the part's family", "part families declare named anchors", "one node per part, named by part id and family" — each will pick one of the three, and a prefab keyed by role `'receiver'` would be offered to `ak-receiver`, whose params (`action` limited to `bolt`, no `chargingHandle`/`rail`) reject it at load.
**Remedy:** document `PartDef.family` as a *role* on `schema.ts:PartDef` (doc comment), rename it or add `role`, and pin the alias table (A5). Prefabs/anchors/export should key on the registry key.

### B4 `gungen/src/viewer/paramPanel.ts#buildPanelModel/fault-values-offered` — effort S

```ts
      const values = spec.values.map((value) => ({
        value,
        permitted: template ? (permittedValues(template, id, name, resolved.params)?.has(value) ?? true) : undefined,
      }));
```
with `parts.ts`: `fit: choice('receiver', 'oversized', 'too-tight')` and `triggerGuard: { values: ['present', 'missing'], default: 'present' }` on both `lower` and `frame`. Those values exist only to build `broken-*` fixtures (verifier: used by 6 broken fixtures and two test files, by no template, by no archetype fixture). `permittedValues` returns `undefined` when the slot omits the param, so `?? true` marks `fit: too-tight` and `triggerGuard: missing` as permitted design choices for every template; `cylinder.chamber: misaligned` is dimmed (the revolver slot pins `chamber: 'aligned'`) but still clickable, and with no template loaded nothing is dimmed. Narrowed from the original claim accordingly.
**Planned change:** 3.1 "Prefabs are named, curated parts … a family plus fixed params", 3.3 "re-rolls only unlocked params … within the template's choices", 3.2 publish check. Nothing distinguishes fault vocabulary from design vocabulary for any of them.
**Remedy:** add `fault?: readonly string[]` (or `hidden`) to `ParamSpec` in `schema.ts` (lane A), set it on the four params, have the panel, suggester and prefab picker skip those values while `resolve` still accepts them for fixtures. A6 enforces it.

### B5 `gungen/src/cli/validate.ts#JSON.parse-as-Assembly/no-shared-loader` — effort S

```ts
  const assembly = JSON.parse(readFileSync(file, 'utf8')) as Assembly;
```
Verifier found six sites that turn JSON into an `Assembly` with no runtime check: `cli/validate.ts:30`, `viewer/main.ts:416` (file input), `viewer/main.ts:45` (`import.meta.glob<Assembly>`), `test/helpers.ts:11` and `:14`, and an untyped `JSON.parse` in `test/connectionContact.test.ts:31`. `resolve()` assumes `assembly.parts`/`connections`/`root` exist (`Object.entries(assembly.parts)` throws on a missing field). The only shape-checked parsers in `src/` are `parseUiState` and `parseOverrides`.
**Planned change:** 3.0 "Loading is a runtime parse, not a type assertion. A malformed file fails to parse. Unknown format versions are refused." Any site left on the cast silently accepts what the others refuse — and the viewer's file input is the one a designer uses.
**Remedy:** one `parseAssembly(text: string | unknown): Assembly` in `src/core` (pattern already in `uiState.ts`), used by all six sites before the `format` field lands, so the version gate has exactly one place to live.

### B6 `gungen/src/viewer/scene.ts#FAMILY_COLORS/six-families-grey` — effort S

```ts
const FAMILY_COLORS: Record<string, number> = {
  receiver: 0x8d_93_9c,
  lower: 0x6f_75_7e,
  ...
  sight: 0x3f_46_50,
};
...
      let color = FAMILY_COLORS[def.family] ?? 0x88_88_88;
```
`frame`, `slide`, `cylinder`, `front-sight`, `gas-block`, `gas-cylinder` have no entry and render grey; the record is open-typed and untested (verifier: no test mentions colours).
**Planned change:** 3.0 "One table of family colours … shared by the viewer and the export"; 3.4 proof "colours match the palette"; 3.0 proof "The viewer's rendering is unchanged after the palette moves" — all three pass trivially for a family that falls through to grey, so the export would ship grey pistols and revolvers without any test noticing.
**Remedy:** move the table to the gun domain, make missing entries impossible (A4), and decide the six colours now.

### B7 `gungen/src/core/generate.ts#generate/one-sequential-rng-stream` — effort S–M

```ts
  const rng = seededRng(seed);
  for (const slot of template.slots) {
    const present = slot.chance === undefined || slot.chance >= 1 || chance(rng, slot.chance);
    ...
    for (const [name, c] of Object.entries(slot.params ?? {})) {
      params[name] = chooseParam(rng, c, parts, domain);
```
`pick` and `chance` each consume one draw (`random.ts`: "Always consumes one draw"; `pick` draws even for a one-item list), scalars and `ParamReference`s consume none, and a `when` clause skips its connection's draws. So adding a list-valued param or an optional slot shifts every later draw for that template, and `known-good seeds` re-snapshot wholesale. Verifier confirmed on `4d4e558` (battle-rifle handguard gained `mount: [...]`: grip `S→M`, magazine `L/straight→S/slant-5`, stock removed, sight slot `2→7` at the same seeds) but also showed the limit: many of the 14 snapshot commits changed *validity*, not draw order, and `generateValid`'s seek to the next valid seed churns snapshots regardless. PROJECT.md treats snapshot changes as a review gate ("look at the new builds in the viewer before updating").
**Planned change:** 3.6 adds an octagonal `profile` choice to barrel slots and 3.3 wants a suggester that "re-rolls only unlocked params" — impossible to build on a single stream without re-drawing everything.
**Remedy:** key each draw by `(seed, slot.id, param)` (a small hash into `seededRng`) so a new choice only changes builds it affects and the suggester can re-roll one param in place. Keep the snapshot gate; it will then flag only real changes.

### B8 `gungen/src/gun/rules.ts#triggerGuardGeometryFits/box-only-fixed-wall` — effort S–M

```ts
  if (![top, rear, front, bottom].every((solid) => solid?.kind === 'box')) {
    return false;
  }
  ...
    close(topBounds.min[1], fingerBounds.max[1]) &&
    close(topBounds.max[1], fingerBounds.max[1] + TRIGGER_GUARD.verticalWall) &&
```
The rule's title is "Every trigger-finger volume has an enclosing guard", but it accepts only four *box* solids named `trigger-guard-*`, flush against the finger box, with vertical walls exactly `TRIGGER_GUARD.verticalWall` thick and symmetric X clearance (verifier: `innerXClearance`, rear-wall thickness, `sideWall`, `zRatio` are left free; the parts.ts import dependency predates this rule, so that part of my original claim was dropped). A guard that encloses the finger with an extruded-polygon wall, a thicker wall or a slanted rear following a raked grip is reported as "does not enclose".
**Past cost:** #59's `parts.test.ts` had to exempt `trigger-guard-*` from the grid test ("Guard geometry preserves the pistol golden and exact contact with angled grips") and `triggerGuard.test.ts` pins the pistol guard "bit-identical to the golden". **Planned change:** 3.6 raked grips (rear wall follows a slanted face) and "visible action details" built as several solids.
**Remedy:** check the property, not the builder: the finger box must be enclosed on ±X and ±Y by *some* guard solids (union of `trigger-guard-*` solids, any kind) with penetration ≤ `TOLERANCE.contact`, and the guard solids must not intrude on the finger box. Drop the `close(...)` equalities.

## C. Knowledge at risk

Design facts that exist only in code, and doc/code disagreements. Quotes are verbatim.

1. **Mount-type count.** `parts.ts` header: "There are 12 mount types" (PROJECT.md: "**Mount types:** 12 now.") and the header lists 12. The code declares 18 distinct `mount:` strings: barrel, barrel-seat, clamp, cylinder, forend, gas-block, gas-cylinder, grip, handguard, lower, lug, magazine, muzzle, rail, sight-block, slide-rails, stock, tube. The six added for handguns/AK are in neither list.
2. **Neighbour-param graph.** PROJECT.md 1.2: "Declared so far: | barrel | `bore` | the receiver on its `rear` port | handguard | `length` | … | tube-magazine | `length` |". Code declares eleven more `from:` links: `receiver.magazineWell ← lower`, `lower.magazineOrientation ← magazine`, `lower.magazineProfile ← magazine`, `barrel.handguardLayout ← clamp`, `front-sight.bore ← base`, `gas-block.bore/barrelLength ← barrel`, `gas-cylinder.barrelLength ← front`, `handguard.barrelBore ← front|rear`, `handguard.bore ← front`, `frame.slideLength ← slide`, `slide.bore ← frame`, `slide.length ← barrel`. Several are *reverse* flows (a lower reads its magazine's orientation to shape its own well), which the doc never says is allowed.
3. **Rule list.** PROJECT.md's rule tables name `firing-grip`, `pistol-barrel-crown`, `feed-match` and the seven core rules; `magazine-well-axis` and `free-float-clearance` appear once each in prose; `handguard-fit` and `trigger-guard` appear nowhere (`grep -c` = 0). `gunDomain.rules` has seven: `firingGrip, feedMatch, pistolBarrelCrown, triggerGuard, handguardFit, freeFloatClearance, magazineWellAxis`. Also inside code: `CORE_RULE_IDS` omits `'connection-contact'` while `CORE_RULES` includes it (A3).
4. **Trigger guards status.** PROJECT.md 3.6: "trigger guards on every archetype (gungen.3, in progress)". PR #59 (merged after the plan) adds guards to every lower layout and the frame, the `trigger-guard` rule, `broken-trigger-guard.json` and `triggerGuard.test.ts` ("builds one four-box guard around every lower layout trigger volume").
5. **Firing grip = stock with a wrist.** PROJECT.md: "`firing-grip` | Something for the firing hand: a part tagged `firing-grip` (a pistol grip, or a stock with a wrist)". Code: only `style === 'sporting'` carries `tags: [FIRING_GRIP]`; the `dropped` stock builds a `solid('wrist', …)` and has no tag. So an AK with a dropped stock and no grip fails `firing-grip` although it "has a wrist".
6. **Family names are roles** (B3): `ak-receiver` builds `family: 'receiver'`, `ak-rear-sight` builds `family: 'sight'`, and rules depend on it. Undocumented.
7. **Grip variants.** A `well: 'magazine'` grip's front vertex is at `PISTOL_GRIP_HALF_X` = 2.25, which would overlap a lower's guard rear wall (B1); it is only ever built through `integratedPistolGrip`. Nothing says a magazine-well grip must not attach to a lower.
8. **Fault-injection values** (`fit`, `chamber: 'misaligned'`, `triggerGuard: 'missing'`) are design-vocabulary-looking params whose only purpose is broken fixtures (B4). No comment marks them.
9. **Palette gaps** (B6): six families are grey by fallback.
10. **Units.** PROJECT.md: "so `1u ≈ 11.5mm`"; `mesh.ts`: "1u ≈ 11.5mm"; `conventions.ts`: "1 u is roughly a centimetre, so models look right, but it is not a measurement." The export (3.4) will hard-code one of these.
11. **Stale line citations in PROJECT.md (all into `parts.ts`, the hottest file):** "`src/gun/parts.ts:1268`" (pistol grip built into frame → `integratedPistolGrip` now at 1316), "`src/gun/parts.ts:1652`" (`FIRING_GRIP` on the stock → 1684), "`src/gun/parts.ts:927-963`" (revolver cylinder → 978–1018), "`src/gun/parts.ts:1641-1672`" (stock → 1659–1708), "`src/gun/parts.ts:266-288`" (receiver keep-outs → 295–323), "`src/gun/parts.ts:1405-1409`" (slide ejection port → 1437–1442). The other citations (`schema.ts:137-162`, `:127-133`, `:46-52`; `paramPanel.ts:78-86`; `main.ts:423-424`; `rules.ts:184-218`, `:235`; `mesh.ts:214`; `scene.ts:124`; `cli/validate.ts:33-45`; deadvox `schema.ts:197-212`, `models.ts:50-52`) still point where they say. See A8.
12. **Root README.** "| `gungen/` | milestone 2 done: validator, viewer, six archetype templates, seeded generator |" — unchanged since `db5c031` (2026-09-24); the code has ten templates, Milestones 2.1–2.3 done and Milestone 3 planned.
13. **Reference images.** PROJECT.md cites "`.agent-mail/scratch/br-ref-stock-taper.png`", "`br-ref-ak74-mag.jpg`", "`br-ref-stanag-20-30.png`" as the measurement basis for size bands. `.agent-mail/` is git-ignored ("Agent mail (maildirs and scratch) lives in the main checkout, untracked") and absent here: the traced ratios in `CURVED_MAGAZINE_PROFILES` (`radius: 25.24, sweepDegrees: 28.5`, `radius: 20.12, sweepDegrees: 45`, `straightTop: 7.1 … straightBottom: 3.11`) cannot be re-derived from anything in the repo.
14. **Tuning values only in code:** `INTERFACE_TOLERANCE_BY_MOUNT = { grip: 0.01, clamp: 0 }` (doc gives these), but not: `TRIGGER_GUARD = { innerXClearance: 0.75, sideWall: 0.5, verticalWall: 0.25, zRatio: 0.625 }` and the lower's `innerXClearance: 0.5`; `LOWER_TRIGGER_X`/`LOWER_GRIP_X` per layout; `AK_GAS_PORT_OFFSET = 8`; `TUBE_DROP = 2.25`; `PISTOL_SLIDE_REAR = -8`; `REVOLVER_CYLINDER_CENTER_X = -4.25`; the `magazine-path` keep-out reaching `-40`; `sightline` keep-out `[2 … 42]`; the barrel `muzzle` keep-out `len + 30`; the rail `slots: { count: 7, pitch: 2 }` at `[-14, 2.5, 0]`; `PISTOL_SLIDE_CHANNEL_CLEARANCE = 0.125` (doc: "A named 0.125u half-grid side clearance" — present). `snapAkGrid` rounds to the 0.25u `GRID`, not "the 2u AK grid" the doc mentions; the 2u snap is inside `akHandguardLength`.
15. **Test timeouts as tuning:** `generate.test.ts`: "AR's 300-seed sweep now exercises the geometry-heavy trigger-guard rule on every build" → `15_000` ms for ak and ar; `mesh.test.ts`: "60 seeds/template keeps that added cost from starving other tests' timeouts". Validation cost per rule is only recorded this way.

## D. What a coding agent with no context would get wrong

- **Run Biome from the repo root after `npm ci` there.** The root README warns: "Don't use `npx biome`: without the root install it resolves the unrelated npm package `biome`, which checks nothing and exits 0." (Prevented by README; worth repeating in `gungen/PROJECT.md` "Running it".)
- **Regenerate snapshots blindly.** `vitest -u` after a parts change updates 30 known-good builds and the mesh count snapshot; the doc requires viewer review first. B2's deletion and B7's keyed RNG would make the remaining diffs meaningful. Prevented by: PROJECT.md M2 tests bullet, `generate.test.ts` comment.
- **Assume `family` is one thing.** Search for `'receiver'` in rules and change the AK family key, or key a new table by `PartDef.family`. Prevented by: B3's doc comment + A5.
- **Add a rule without a broken fixture** — `fixtures.test.ts` catches it for gun rules and for the ids in `CORE_RULE_IDS`, but not for a core rule added only to `CORE_RULES` (A3).
- **Add a template choice and be surprised** that every seed of that template changes and that `site/index.html` must be edited by hand (`npm run test:site` at the root fails otherwise; the launcher test explains). Prevented by: A7/test:site; B7.
- **Change the grip profile** and get `trigger-guard` failures across seven templates with a message about the lower (B1). Prevented by B1's remedy; until then, a comment on `lowerGripContactX` naming `grip.build`'s `[1.5, 0]` vertex.
- **Offer or generate `fit: 'too-tight'`** as a real choice in a prefab or suggestion (B4/A6).
- **Read `npm run validate` exit 0 as "valid"** — it only checks `expect` mismatches (`process.exitCode = unexpected > 0 ? 1 : 0`); an invalid file with no `expect` passes. The plan knows (3.2); a one-line note in "Running it" would prevent it now.
- **Treat `PartDef.solids` as free geometry** — every extruded polygon must be convex CCW or `resolve` drops it with a `structure` issue and the part silently loses a solid in collision *and* rendering. Prevented by: `validateExtrudedPolygon`'s message and PROJECT.md 2.1; a thumbhole stock needs several solids (doc says so).
- **Put a built-in handle inside its own travel keep-out** — the `keep-out` rule exempts the owner (`const allowed = new Set([owner])`). PROJECT.md 3.6 already warns; a targeted test is the only guard.
- **Import `three` or `gun/` from `src/core`** — nothing enforces it today (A1/A2). Node modules are already restricted to `src/cli`/`test` by `biome.jsonc`.

## E. Method notes

- **"Next few commits" did not work.** Main is merge-only with 12 gungen merges; one (#49) carries 27 commits spanning three milestones, and every real follow-up fix was either inside its own PR (`WIP → fix` sequences) or a dedicated one-commit PR (#57). I switched to non-merge commit messages (fix/correct/revert/allow/refresh/WIP) and `git show` on each, plus per-file touch counts over non-merge commits. The 31/53 count for `parts.ts` is the most reliable signal the history gives.
- **No node_modules anywhere in the checkout**, so I could not run the suite, time `validate()`, or read Biome's installed schema. Consequences: A2 is written from Biome 2.x docs and must be checked against `configuration_schema.json`; a ninth candidate finding (test-suite time growing per rule; the AR timeout bump) was dropped from B for lack of a measurement rather than because it was wrong. Installing would have written into the repo, which the rules forbid.
- **Verification subagents earned their cost.** Eight ran; five confirmed, three narrowed (B4: `misaligned` is dimmed under the revolver template; B7: much snapshot churn is validity-driven, and the churn is an intended review gate; B8: the rule leaves `innerXClearance`/rear-wall thickness free and the parts.ts import coupling predates it). None refuted outright, so nothing was dropped, but the narrowing removed three overclaims I would otherwise have published. B1's verifier also found the magazine-well grip overlap (C7), which I had not.
- **Finding cap of 8 fit.** I had nine candidates; the cap forced dropping the least-evidenced one, which was the right call.
- **Inputs were easy except lifespan.** The plan reads like a long-lived product ("hand them to deadvox"), the README like an experiment; I chose "will evolve" and did both analyses, which cost little.
- **The boundary rule ("duplication across projects is not a finding") slightly misfires here**: `site/index.html` duplicates gungen's template/fixture lists on purpose and is pinned by a root test, so it is worth *knowing* (D) even though it is not a finding.
- **Line-number citations in the plan** were a useful tripwire: six of sixteen were already stale one PR after the plan merged, which is itself evidence of how hot `parts.ts` is.
