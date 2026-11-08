local figure = import 'tools/jsonnet/lib/actor-figure.libsonnet';
{
  actorFigures: [
    figure(import 'packages/skelly-assets/built/skelly.body/actors/player.1.body.json', import 'packages/skelly-assets/built/skelly.body/actors/player.1.clips.json'),
  ],
}
