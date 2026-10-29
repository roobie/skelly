local crate = [entry for entry in (import 'furniture.jsonnet').furniture if entry.id == 'crate'][0];
{
  furniture: [crate + {
    id: 'hunting_crate',
    size: [3, 2, 2],
    massKg: crate.massKg * 1.5,
    shape: [part + {
      position: [part.position[0] * 1.5, part.position[1], part.position[2]],
      size: [part.size[0] * 1.5, part.size[1], part.size[2]],
    } for part in crate.shape],
    container: { pockets: [{ grid: [10, 15], handlingSimSeconds: 1.2 }] },
  }],
}
