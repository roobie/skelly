// A door forcing method that Mechanics practice shortens from its novice time to its hidden expert time.
local skillCurve = import 'tools/jsonnet/lib/skill-curve.libsonnet';
{
  local method = self,
  fastestTimeSimSeconds:: error 'a forcing method needs fastestTimeSimSeconds',
  skills: { mechanics: skillCurve.between(method.timeSimSeconds, method.fastestTimeSimSeconds, 4) },
}
