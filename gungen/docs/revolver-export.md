---
read_if:
  - you change or consume the revolver model export, shared writer or moving-part transforms
  - you refresh the revolver or its ammunition in Deadvox
---

# Revolver export

The revolver uses assembly parts rather than display groups because only parts have independently transformable GLB nodes. This keeps mechanical identity in the assembly and leaves the shared writer domain-neutral; see `src/gun/revolver.ts`, `revolverFamilySet`, and `packages/thing-export/src/glb.ts`, `addPart`.

## Runtime composition

The separate revolver contract avoids pretending that rotating parts follow the linear carrier timeline. See `src/gun/revolverExport.ts`, `RevolverMetadata`, and `src/gun/exportGlb.ts`, `DeadvoxModelEntry`. The playable consumer validates it through `packages/deadvox/src/core/schema.ts`, `RevolverSchema`.

All points, axes and displacements use the exported model frame, with lengths in metres and signed right-hand rotations in radians. Each node's rest transform is its assembled GLB pose, not an identity transform and not a pivot-relative pose. The writer's node list is flat. Consumers must reset to that rest pose each frame rather than accumulate deltas.

Let C be rotation about the exported crane pivot, D rotation about the exported cylinder centre, E translation along the exported ejector axis, and R each node's assembled rest matrix. With column vectors, pose the crane as C × R, the cylinder as C × D × R, and the ejector as C × D × E × R. Hammer and trigger rotations independently precede their own rest matrices. Do not rotate the ejector around the crane a second time through parenting. Chamber zero starts on +y and advances toward +z around the cylinder's positive axis; its phase and orbit describe the chamber mouths without a separate anchor list.

The hinge comes from the swing-side lower yoke edge. The opening angle must carry the drum into the reserved swing side and clear every frame solid, not merely unlatch it. The hammer pin follows its body's lower bearing edge; its travel reservation bounds the cocking direction. The trigger root and bow bound its pull. These are stylized pose controls, not measured revolver mechanics. Derivation and clearance live in `src/gun/revolverExport.ts`, `revolverMetadata`; the independent flat-node and clearance probes live in `test/revolverExport.test.ts`.

## Cartridge and refresh

The curated design carries its own cartridge identity. Geometry-only exports without cartridge metadata omit the revolver block because the ejector stroke needs a sourced case length. Unknown cartridge measurements stay unknown; presentation may use the sourced maximum overall length when no typical length is available. The generic projectile seating and primer remain visual proxies, not cartridge specifications; see `src/ammo/roundProfile.ts`, `roundProfiles`, and `cartridges/README.md`.

Asset credits cover runtime media rather than Jsonnet authoring programs. Keeping the manifest's source beside its compiled output must not require that source to credit itself; see `packages/deadvox/src/core/assets.ts`, `assetFileIssues`.

The CLI owns the GLBs and JSON entries under `packages/deadvox/src/content/base/gungen`; Jsonnet imports those entries into the firearm pack so refreshes have one metadata writer. See `src/cli/export.ts`, `src/cli/exportCartridges.ts`, and `packages/deadvox/src/content/base/models-firearms.libsonnet`. Do not hand-edit exported geometry or metadata.
