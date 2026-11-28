local depthMetres = 0.5;
local member(ratio, grade, source, basis) = {
  spanToDepthRatio: ratio,
  grade: grade,
  source: source,
  basis: basis,
  clearSpanMetres: depthMetres * ratio,
};
{
  depthMetres: depthMetres,
  materials: {
    // SCI P166, Medium Span systems: uniformly loaded hot-rolled composite floor beams use approximately L/25.
    // Its design studies assume S355 steel and C25/30 concrete. The hall caps the ratio below that guide value.
    metal: member(
      21, 'S355 steel with C25/30 composite floor slab',
      'https://www.steelconstruction.info/upload/Wiki-Files/7/70/SCI_P166.pdf',
      'Medium Span systems; S355 assumption in Design studies. Hall clear span divided by member depth sets the conservative cap.',
    ),
    // Swedish Wood, The Glulam Handbook Volume 2, Beams: a medium-span simply supported beam under uniform
    // loading needs about L/20 depth for bending. The adjoining design chart uses GL30c; apply that grade to floor beams.
    timber: member(
      20, 'GL30c glulam',
      'https://www.swedishwood.com/siteassets/5-publikationer/pdfer/glulamhandbook2-240508.pdf',
      'Beams; simply supported, uniformly distributed floor load, bending-controlled preliminary ratio; GL30c design chart.',
    ),
    // StructurePoint, Simply Supported Reinforced Concrete Beam Analysis and Design (ACI 318-14), Preliminary
    // Member Sizing: h >= clear span/16, from ACI 318-14 Table 9.3.1.1. Overall depth h, not effective depth d.
    // Its uniform dead/live-load example assumes normal-weight 4.35 ksi concrete and 60 ksi reinforcing steel.
    reinforced_concrete: member(
      16, 'Normal-weight concrete f_c = 4.35 ksi, Grade 60 reinforcing steel',
      'https://structurepoint.org/publication/pdf/DE-Simply-Supported-Reinforced-Concrete-Beam-Analysis-and-Design-ACI-318-14-spBeam-v1000.pdf',
      'Preliminary Member Sizing; simply supported beam under uniform dead/live floor load; overall-depth deflection-control ratio.',
    ),
  },
}
