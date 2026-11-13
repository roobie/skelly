{
  rules(anchors, first, gap, count, escalation)::
    assert std.length(anchors) > 0;
    assert count > 0 && first > 0 && gap > 0;
    assert std.length(escalation) > 0;
    [
      local row = escalation[std.min(n, std.length(escalation) - 1)];
      {
        id: 'holding_wave_%d' % (n + 1),
        trigger: { kind: 'elapsed', afterGameHours: first + n * gap },
        effects: [{ kind: 'releaseHorde', actor: row.actor, count: row.count, at: anchors }],
      }
      for n in std.range(0, count - 1)
    ],
}
