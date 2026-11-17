local look = import '../skelly.deadvox.scenario.with-magic/missile-look.libsonnet';
// The level cap, whole missile steps above the low look's, so the volley is visibly larger.
look.look('High', look.levels.master)
