// Wall-leeway debug spike tunables; `?wall.<key>=<value>` overrides each one for a session.
{
  // Proxy radius: the farthest authored anchor or hold from the butt-to-muzzle line, times this, plus the extra.
  radiusScale: 1,
  radiusExtraMetres: 0.01,
  // Swept reach past the muzzle along the bore.
  reachMetres: 0.1,
  // Clearance the lowered proxy must keep from every box.
  marginMetres: 0.02,
  // Lowering at coefficient 1, and the curve exponent: angle = maxLowerDegrees * coefficient ^ curveExponent.
  maxLowerDegrees: 70,
  curveExponent: 1,
  // Coefficient steps searched from 0 to 1.
  steps: 35,
  // Cells gathered beyond the swept proxy's reach.
  regionPaddingBlocks: 1,
}
