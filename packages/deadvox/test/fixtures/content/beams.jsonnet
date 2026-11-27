local beams = import 'packages/mods/skelly.natural-world/beams.libsonnet';
{
  blocks: beams([
    { id: 'fixture_override', material: 'fixture_material', name: 'Fixture beam', color: '#888888', footstep: 'fixture_step', span: 1.25, burnsTo: 'fixture_char' },
    { id: 'fixture_fallback', material: 'fixture_material', name: 'Fixture fallback beam', color: '#888888', footstep: 'fixture_step', burnsTo: 'fixture_char' },
  ]),
}
