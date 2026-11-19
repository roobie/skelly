local built = import 'tools/jsonnet/lib/built-pack.libsonnet';
{
  wieldMotions: built.motions('skelly.body', 'doll_melee'),
}
