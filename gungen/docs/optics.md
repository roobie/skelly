---
read_if:
  - you're changing optic envelopes, geometry or receiver mounting constraints
  - you're authoring or resizing an iron rear sight's notch
---

# Optic reference envelopes

Optics are static, persisted attachment choices. Their catalog shapes are visual classes based on cited products, not manufacturer CAD; glass, reticles, zoom, night vision and thermal behavior are outside this model. The catalog owns source dimensions and mount requirements in `src/gun/optics.ts`, `OPTIC_CATALOG`.

Mount support is based on actual foot geometry rather than the nominal envelope, because an optic body can overhang a rail without a valid unsupported mount. Body collisions and loading clearance remain separate checks; see `src/gun/rules.ts`, `opticMountFitForPart`, and `src/gun/optics.ts`, `pairedFeet`.

Persisted optic IDs are not display labels, so visual-class changes do not silently rename a design's selected attachment. Mount and sightline rules are specified by the catalog and firearm validation, not by a second table of dimensions here.

The pump shotgun's ADS uses a simple front bead rather than rifle-style iron sights, preserving the shotgun sight picture. Its exported eye line is derived from the bead and receiver; see `src/gun/exportGlb.ts`, `frontBeadSightLine`.

The AK rear sight's ADS line uses the notch edge rather than the sight-block seat, so the aiming datum follows the opening instead of the mount surface; see `src/gun/parts.ts`, `akRearSight`, and `src/gun/exportGlb.ts`, `sightMetadata`.

A rear sight's notch must be wide enough for the voxel lattice to leave it open. A voxelized file keeps a voxel wherever a solid's centre-sampled span reaches it, so a notch one voxel wide or narrower of the grain it is drawn at can hold no voxel centre and fill, and the player lines up a solid block. Author the notch wider than one voxel of whatever grain draws it, and export refuses a sight whose drawn notch is narrower than the gun grain; see `src/gun/exportGlb.ts`, `openNotchOrThrow`, and `test/rearSightNotch.test.ts`.
