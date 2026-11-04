local models = [
  import 'things/baseball_bat.model.json',
  import 'things/kabar.model.json',
  import 'things/machete.model.json',
  import 'things/steel_pipe.model.json',
];
(import 'item-presentation.libsonnet').pack({ models: models })
