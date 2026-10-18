local fn(name, params, expression, result='double') = {
  name: name, params: params, expression: expression, result: result,
};
local param(name, type) = { name: name, type: type };
local consumer(id, functions=[]) = {
  id: id, dependencies: ['bandsv1'], state: [], functions: functions,
  rules: [{
    id: id + ':use', event: 'cast', when: 'true',
    effects: 'cel.bind(table, bandsv1_table([1.0, 4.0]), [damage(bandsv1_score(table, level))])',
  }],
};
[
  {
    id: 'bandsv1', dependencies: [], state: [], rules: [],
    functions: [
      fn('table', [param('bands', 'list<double>')], '{"low": bands[0], "high": bands[1]}', 'map<string, double>'),
      fn('score', [param('table', 'map<string, double>'), param('value', 'double')],
         'lerp(table["low"], table["high"], clamp(value / 10, 0, 1))'),
      fn('copy', [param('bands', 'list<double>')], 'bands', 'list<double>'),
    ],
  },
  consumer('plain'),
  consumer('changed', [fn('score', [param('table', 'map<string, double>'), param('value', 'double')],
                        'table["high"]') + { replaces: 'bandsv1_score' }]),
  {
    id: 'standalone', dependencies: [], state: [],
    functions: [fn('clamp', ['value'], 'value * 2')],
    rules: [{
      id: 'standalone:use', event: 'cast', when: 'true',
      effects: '[damage(clamp(lerp(1.0, 3.0, 0.5), 0.0, 3.0)), overload(rank(level, [1.0, 4.0])), spend(standalone_clamp(1.0))]',
    }],
  },
]
