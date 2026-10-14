local base = import '../../../src/content/base/scenarios.jsonnet';
{
  scenarios: [scenario + { city+: {
    templates: [row + { weight: if row.id == 'gauntlet_gun_store' then 1 else 0 } for row in scenario.city.templates],
  } } for scenario in base.scenarios],
}
