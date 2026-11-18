local look = import '../skelly.deadvox.scenario.with-magic/missile-look.libsonnet';
// A missile that strikes in the step it launches has no flight to draw, so this look shows its impact alone.
look.look('PointBlank', look.levels.novice, look.pointBlank)
