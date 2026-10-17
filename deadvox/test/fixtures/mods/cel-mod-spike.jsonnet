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
      fn('cost', ['level', 'drain'], 'add(2.0, add(level, divide(drain, 10.0)))'),
      fn('strength', ['intellect', 'level', 'drain'],
         'clamp(mul(add(intellect, level), add(1.0, divide(drain, 100.0))), 0.0, 100.0)'),
    ],
    state: [{ key: 'mom:uses', min: 0, max: 100, initial: 0, bands: [10] }],
    rules: [
      rule('mom:power', 'cast',
           '[spend(mom_cost(level, state["mom:uses"])), roll < 0.8 ? damage(mom_strength(intellect, level, state["mom:uses"])) : overload(1.0), change("mom:uses", min(1.0, sub(100.0, state["mom:uses"])))]',
           'flags.exists(flag, flag == "focused") && target["distance"] < 10.0'),
    ],
  },
  {
    id: 'attune',
    dependencies: ['mom'],
    functions: [],
    state: [{ key: 'attune:drain', min: 0, max: 100, initial: 0, bands: bands }],
    rules: [
      rule('attune:gain', 'cast', '[change("attune:drain", min(7.0, sub(100.0, ' + counter + ')))]') + { onTrue: 'attune:consequence' },
      {
        id: 'attune:consequence',
        when: rank + ' > 0.0',
        effects: 'weighted(roll, [1.0, ' + rank + ' > 1.0 ? 3.0 : 0.0], [overload(1.0), damage(' + rank + ')])',
        onFalse: 'attune:quiet',
      },
      { id: 'attune:quiet', when: 'true', effects: '[overload(0.0)]' },
      rule('attune:decay', 'decay', '[change("attune:drain", sub(max(0.0, sub(' + counter + ', 2.0)), ' + counter + '))]'),
      rule('attune:power', 'cast', '[spend(mom_cost(level, ' + counter + ')), damage(mom_strength(intellect, level, ' + counter + '))]'),
    ],
  },
  {
    id: 'resonance',
    dependencies: ['mom'],
    optional: ['attune'],
    requires: 'attune',
    functions: [
      fn('cost', ['level', 'drain'], 'max(0.0, sub(add(level, divide(drain, 10.0)), 1.0))') + { replaces: 'mom_cost' },
      fn('echo', ['intellect', 'level', 'drain'], 'divide(mom_strength(intellect, level, drain), 2.0)'),
    ],
    state: [],
    rules: [
      rule('resonance:echo', 'cast', '[damage(resonance_echo(intellect, level, ' + counter + '))]'),
    ],
  },
]
