// Everything a mobgen viewer mob may load: the spawnable `TEMPLATES`, plus the opt-in bodies (both
// comparison builds of the dog and the amalgam) that consumers must choose explicitly. It lives in its
// own module rather than beside mob/amalgamTemplate.ts because Deadvox imports that one
// (deadvox/src/render/mobActors.ts) and its import closure is the simulation distribution
// (deadvox/tools/simulationFingerprint.ts); the comparison dogs must stay unreachable from a player
// until their own Deadvox feature, just like being absent from `TEMPLATES`.

import type { Template } from '../core/template.ts';
import { amalgamTemplate } from './amalgamTemplate.ts';
import { dogM3Template, dogTemplate } from './dogTemplate.ts';
import { TEMPLATES } from './templates.ts';

export const VIEWER_TEMPLATES: readonly Template[] = [...TEMPLATES, dogTemplate, dogM3Template, amalgamTemplate];
