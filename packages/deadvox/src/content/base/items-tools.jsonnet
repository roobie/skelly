local content = import 'items-tools.libsonnet';
local authored = import 'authored-model-physics.libsonnet';
(import 'economy.libsonnet').pack(content + { models: [authored(model) for model in content.models] })
