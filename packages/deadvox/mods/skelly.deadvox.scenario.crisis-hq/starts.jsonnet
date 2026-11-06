local layouts = (import 'packages/deadvox/mods/skelly.deadvox.crisis-hq/crisis-hq.jsonnet').layouts;
{ starts: (import 'tools/jsonnet/lib/start-kit.libsonnet').fromLayouts(layouts) }
