local van = import 'van-body.libsonnet';
local s = import 'panel_van.spec.libsonnet';
van.rows('panel_van', s) + [van.grillePanel(s)]
