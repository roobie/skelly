import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const GRADE_DECLARATIONS = `
uniform float uGradeEnabled;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uVignette;
uniform float uGrain;
uniform float uSeed;

float moodHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 moodGrade(vec3 color) {
  vec3 c = clamp(color, 0.0, 1.0);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c += uShadowTint * (1.0 - smoothstep(0.0, 0.5, l)) + uHighlightTint * smoothstep(0.5, 1.0, l);
  c = clamp(c, 0.0, 1.0);
  c = mix(c, c * c * (3.0 - 2.0 * c), uContrast);
  c *= 1.0 - uVignette * smoothstep(0.25, 0.7071, length(vUv - 0.5));
  c += (moodHash(gl_FragCoord.xy + uSeed) - 0.5) * uGrain;
  return c;
}
`;

/** Grade in display space, without storing and re-reading a display-space frame. */
export function createMoodOutputPass(): OutputPass {
  const output = new OutputPass();
  Object.assign(output.uniforms, {
    uGradeEnabled: { value: 0 },
    uSaturation: { value: 1 },
    uContrast: { value: 0 },
    uShadowTint: { value: [0, 0, 0] },
    uHighlightTint: { value: [0, 0, 0] },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uSeed: { value: 0 },
  });
  const shader = output.material.fragmentShader;
  const main = shader.indexOf('void main()');
  const end = shader.lastIndexOf('}');
  if (main < 0 || end <= main) {
    throw new Error('OutputPass shader no longer has the mood integration point');
  }
  // OutputPass owns tone mapping and the transfer function; grade must follow both.
  output.material.fragmentShader = `${shader.slice(0, main)}${GRADE_DECLARATIONS}${shader.slice(main, end)}
  if (uGradeEnabled > 0.5) {
    gl_FragColor = vec4(moodGrade(gl_FragColor.rgb), 1.0);
  }
}`;
  return output;
}
