local fn(name, params, expression) = { name: name, params: params, expression: expression };
local rule(id, event, effects, when='true') = {
  id: id, event: event, when: when, effects: effects,
};
local counter = 'state["attune:drain"]';
local bands = [10, 20, 30];
local rank = 'rank(' + counter + ', [' + std.join(', ', [std.toString(band) + '.0' for band in bands]) + '])';
[
  {
    id: 'mom',
    dependencies: [],
    functions: [
      fn('cost', ['level', 'drain'], '2 + level + drain / 10'),
      fn('strength', ['intellect', 'level', 'drain'],
         'clamp((intellect + level) * (1 + drain / 100), 0, 100)'),
    ],
    state: [{ key: 'mom:uses', min: 0, max: 100, initial: 0, bands: [10] }],
    rules: [
      rule('mom:power', 'cast',
           '[spend(mom_cost(level, state["mom:uses"])), roll < 0.8 ? damage(mom_strength(intellect, level, state["mom:uses"])) : overload(1.0), change("mom:uses", min(1, 100 - state["mom:uses"]))]',
           'flags.exists(flag, flag == "focused") && target["distance"] < 10.0'),
    ],
  },
  {
    id: 'attune',
    dependencies: ['mom'],
    functions: [],
    state: [{ key: 'attune:drain', min: 0, max: 100, initial: 0, bands: bands }],
    rules: [
      rule('attune:gain', 'cast', '[change("attune:drain", min(7, 100 - ' + counter + '))]') + { onTrue: 'attune:consequence' },
      {
        id: 'attune:consequence',
        when: rank + ' > 0.0',
        effects: 'weighted(roll, [1.0, ' + rank + ' > 1.0 ? 3.0 : 0.0], [overload(1.0), damage(' + rank + ')])',
        onFalse: 'attune:quiet',
      },
      { id: 'attune:quiet', when: 'true', effects: '[overload(0.0)]' },
      rule('attune:decay', 'decay', '[change("attune:drain", max(0, ' + counter + ' - 2) - ' + counter + ')]'),
      rule('attune:power', 'cast', '[spend(mom_cost(level, ' + counter + ')), damage(mom_strength(intellect, level, ' + counter + '))]'),
    ],
  },
  {
    id: 'resonance',
    dependencies: ['mom'],
    optional: ['attune'],
    requires: 'attune',
    functions: [
      fn('cost', ['level', 'drain'], 'max(0, level + drain / 10 - 1)') + { replaces: 'mom_cost' },
      fn('echo', ['intellect', 'level', 'drain'], 'mom_strength(intellect, level, drain) / 2'),
    ],
    state: [],
    rules: [
      rule('resonance:echo', 'cast', '[damage(resonance_echo(intellect, level, ' + counter + '))]'),
    ],
  },
]
