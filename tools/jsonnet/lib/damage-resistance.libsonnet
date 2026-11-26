// A material's share of a blow's strength it shrugs off, per damage kind. Block and furniture materials build theirs
// here, so both name every kind in one order and a new kind is a new required argument everywhere at once.
{
  resistance(blunt, cut, pierce, blast, fragment, breach, crush, acid, heat):: {
    blunt: blunt, cut: cut, pierce: pierce, blast: blast, fragment: fragment, breach: breach, crush: crush, acid: acid,
    heat: heat,
  },
}
