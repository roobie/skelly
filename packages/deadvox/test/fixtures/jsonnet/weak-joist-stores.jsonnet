// A works stores whose shell slot may also be built with concrete where the steel joists go: the same solid cells, but
// a shorter span, so in that rarely drawn alternative the slab does not hold.
local works = import '../../../mods/skelly.deadvox.buildings/works-stores.libsonnet';
local racking = works.racking('fixture_weak_joist_racking', [['..........' for _ in std.range(1, 8)] for _ in [1, 2, 3, 4]], {});
local answer = works.answer('fixture_weak_joist_stores', racking.id);
local shell = answer.slots[0];
{
  mapStyles: [{
    id: 'fixture_concrete_joists',
    bindings: works.mapStyles[0].bindings + { joists: { role: 'support', block: 'concrete' } },
  }],
  mapPieces: [racking],
  mapAssemblies: [answer + {
    slots: [shell + {
      choices: [
        { ref: shell.choices[0].ref, weight: 1000 },
        { ref: shell.choices[0].ref + { style: 'fixture_concrete_joists' }, weight: 1 },
      ],
    }] + answer.slots[1:],
  }],
}
