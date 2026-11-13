local layouts = (import 'packages/deadvox/mods/skelly.deadvox.rural-sites/rural-police.jsonnet').layouts;
{ starts: (import 'tools/jsonnet/lib/start-kit.libsonnet').fromLayouts(layouts) }
