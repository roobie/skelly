local start = (import '../skelly.deadvox.scenario.test-house.shadow-plan-now/starts.jsonnet').starts[0];
{ starts: [start + { id: 'shadowplanb' }] }
