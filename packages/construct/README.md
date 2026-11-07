---
read_if:
  - you change the shared assembly, fit, geometry or validation code
  - you add a new consumer of the construct package
  - you change where the construct package's tests live or what its boundary test enforces
  - you defer or implement revolute PartMotion
  - "you change the construct/domain boundary for issue #509"
  - you distinguish construction choices from appearance profiles
  - you wonder why this package is called construct and not engine or assembly
---

# construct

`@skelly/construct` is the shared assembly, fit and geometry library the authoring tools build
on. Consumers should share geometry and fit mechanisms without sharing domain policy. Keeping domain vocabulary out of this package lets each consumer evolve its own data and rules independently.

**Name.** The `engine` name belongs to the game runtime, the simulation code that leaves
`packages/deadvox` under #1532. "assembly" was rejected because deadvox already uses it for
game terms (welded vehicle assemblies, disassembly, `assembleContentBuild`) and because it
names only the top layer. "construct" says "build a thing from parts" without that clash. The
top layer keeps the directory name `src/assembly`, because there it names the layer alone.

Construction choices belong to assembly templates; presentation profiles stay outside this
package so changing a finish cannot change assembly choices. See `src/assembly/template.ts`,
`Template.variantParams`. Domain validation stays caller-owned through
`src/assembly/designLoader.ts`, `DesignLoadInputs.validateDesign`.

Assemblies are graphs rather than trees because one part may need to fit against multiple neighbours, as a handguard can meet both receiver and barrel. Preserving that loop lets validation expose a closure mismatch instead of silently dropping a connection; see `src/assembly/resolve.ts`, `resolve`.

**Layers.** Source is split into layers, and a layer may import only itself and the ones before it; the order is `test/constructImportBoundary.test.ts`, `constructLayers`. The three.js scene lives above this package, in `packages/tool-ui/src/scene.ts`, `buildLayers`. A layer that needs a higher one's type is a sign the type belongs lower. The package ends at assembly so material content and model formats cannot pull dependencies back into geometry. Export has its own home above the neutral core; see `packages/thing-export/README.md`, "thing-export".

The package owns its boundary test, `test/constructImportBoundary.test.ts`, "construct import boundary", because the layers and the domain-neutral names are its rules, and a check kept beside the code it guards cannot drift from it. The same test enforces the import edges of every package under `packages/`, so a lower package that reaches an authoring tool, either tool that reaches its peer, or deadvox that reaches the construct or export package fails here. The contract test is `test/constructContracts.test.ts`; gun-facing contracts stay in `packages/gun-authoring-tool/test/m3Contracts.test.ts`, which exercises this package as a consumer.

A motion may turn about a local pivot before translating so consumers can describe coupled rotation and travel without putting domain-specific action phases in this package. See `src/assembly/schema.ts`, `PartMotion`, and `src/assembly/motion.ts`, `motionTransform`. FAL handle fold remains deferred under #648.
