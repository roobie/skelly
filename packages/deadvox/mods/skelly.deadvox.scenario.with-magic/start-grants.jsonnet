local magic = import 'magic-grants.libsonnet';
// A patch rather than a start of its own, so the run still begins where the product's default start puts it; see
// `packages/deadvox/docs/magic-mod.md`, "The with-magic scenario".
{
  patches: [{
    section: 'starts',
    id: (import '../skelly.deadvox/pack/manifest.jsonnet').defaultStart,
    add: magic.grants(magic.missileLevels.novice),
  }],
}
