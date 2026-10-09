import {
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  type Group,
  HemisphereLight,
  MathUtils,
  type Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Sphere,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { formatCartridgeParseError, parseCartridgeJson } from '../ammo/parseCartridge.ts';
import type { DesignLoadResult } from '../core/design.ts';
import { generate, generateValid } from '../core/generate.ts';
import { worldBox } from '../core/geometry.ts';
import type { Issue } from '../core/issue.ts';
import { formatParseError, parseAssemblyJson } from '../core/parseAssembly.ts';
import { DEFAULT_REVOLVE_FACETS, MAX_REVOLVE_FACETS, MIN_REVOLVE_FACETS } from '../core/revolve.ts';
import type { Assembly, Connection } from '../core/schema.ts';
import type { Template } from '../core/template.ts';
import { type Report, validate } from '../core/validate.ts';
import { actionOpenOffsets, resolveGunAction } from '../gun/actionDescription.ts';
import { previewFittedAttachments } from '../gun/attachmentPreview.ts';
import { withAttachmentInstanceAppearances } from '../gun/attachments.ts';
import { loadGunDesign } from '../gun/designLoader.ts';
import { gunDomain } from '../gun/domain.ts';
import { TEMPLATES } from '../gun/templates.ts';
import { type AmmoMeshes, ammoEnvironment, buildAmmoMeshes, caseFinishFromQuery } from './ammoLayer.ts';
import { type CameraState, parseCameraState, serializeCameraState } from './cameraState.ts';
import { createCycleView } from './cycleView.ts';
import {
  availablePrefabs,
  choosePrefab,
  clearEditorParam,
  clearPrefab,
  createEditorState,
  type DesignEditorState,
  editorStateFromDesign,
  editParam,
  saveDesign,
  saveDesignForDownload,
  setOptionalPart,
  toggleOptionalPartLock,
  toggleParamLock,
  withEditorAssembly,
  withEditorStatus,
} from './designEditor.ts';
import { buildDesignViewModel } from './designViewModel.ts';
import { buildDetachedMagazine } from './magazineView.ts';
import {
  buildPanelModel,
  clearParam,
  diffOverrides,
  EMPTY_OVERRIDES,
  hasOverrides,
  initialOverrides,
  type PanelEntry,
  type PanelParam,
  type PanelPart,
  type PanelSlot,
  parseOverrides,
  setParam,
} from './paramPanel.ts';
import { buildLayers, disposeGroup, type Layers } from './scene.ts';
import { setModelQuery as writeModelQuery } from './shareUrl.ts';
import { DEFAULT_UI_STATE, parseUiState, UI_STATE_KEY, type UiState } from './uiState.ts';

const fixtures = Object.entries(
  import.meta.glob<string>('../../fixtures/*.json', { eager: true, import: 'default', query: '?raw' }),
)
  .map(([path, text]) => {
    const parsed = parseAssemblyJson(text);
    if (!parsed.ok) {
      throw new Error(`${path}: ${formatParseError(parsed.error)}`);
    }
    return parsed.assembly;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const DESIGN_EXTENSION = /\.json$/;
const designs = Object.entries(
  import.meta.glob<string>('../../designs/*.json', { eager: true, import: 'default', query: '?raw' }),
)
  .map(([path, text]) => ({ name: path.split('/').at(-1)!.replace(DESIGN_EXTENSION, ''), text }))
  .sort((a, b) => a.name.localeCompare(b.name));

const cartridges = Object.entries(
  import.meta.glob<string>('../../cartridges/*.json', { eager: true, import: 'default', query: '?raw' }),
).flatMap(([path, text]) => {
  const parsed = parseCartridgeJson(text);
  if (!parsed.ok) {
    throw new Error(`${path}: ${formatCartridgeParseError(parsed.error)}`);
  }
  return [parsed.cartridge];
});

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const view = $<HTMLElement>('view');
const select = $<HTMLSelectElement>('fixture');
const fileInput = $<HTMLInputElement>('file');
const description = $<HTMLParagraphElement>('description');
const fitNotice = $<HTMLParagraphElement>('fit-notice');
const designInfo = $<HTMLElement>('design-info');
const status = $<HTMLDivElement>('status');
const issueList = $<HTMLOListElement>('issues');
const designWarnings = $<HTMLElement>('design-warnings');
const noticeEl = $<HTMLElement>('issues-notice');
const issuesBtn = $<HTMLButtonElement>('issues-btn');
const issuesOverlay = $<HTMLElement>('issues-overlay');
const hover = $<HTMLParagraphElement>('hover');
const templateSelect = $<HTMLSelectElement>('template');
const seedInput = $<HTMLInputElement>('seed');
const onlyValid = $<HTMLInputElement>('only-valid');
const layerToggles = [...document.querySelectorAll<HTMLInputElement>('#layers input')];
const paramPanel = $<HTMLElement>('param-panel');
const designStatus = $<HTMLSelectElement>('design-status');
const saveMessage = $<HTMLParagraphElement>('save-message');
const saveButton = $<HTMLButtonElement>('save');
const roleColors = $<HTMLInputElement>('role-colors');
const initialQuery = new URLSearchParams(location.search);
let colorMode: 'finish' | 'role' = initialQuery.get('colors') === 'role' ? 'role' : 'finish';
roleColors.checked = colorMode === 'role';
// Six facets read as chamfered boxes on close optic views; sixteen keeps the silhouette round and low-poly.
const requestedFacets = Number(initialQuery.get('facets'));
const revolveFacets =
  Number.isInteger(requestedFacets) && requestedFacets >= MIN_REVOLVE_FACETS && requestedFacets <= MAX_REVOLVE_FACETS
    ? requestedFacets
    : 16;
roleColors.addEventListener('change', () => {
  colorMode = roleColors.checked ? 'role' : 'finish';
  syncUrl();
  redraw();
});

const readUiState = (): UiState => {
  try {
    return parseUiState(localStorage.getItem(UI_STATE_KEY));
  } catch {
    return structuredClone(DEFAULT_UI_STATE);
  }
};
const uiState = readUiState();
const saveUiState = () => {
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(uiState));
  } catch {
    // Keep the viewer usable when storage is disabled or full.
  }
};

/** Keeps the address bar a shareable link for the current model, including panel overrides. */
const setModelQuery = (params: URLSearchParams): void =>
  writeModelQuery(params, {
    designName: activeDesign?.name,
    designNames: designs.map(({ name }) => name),
    assembly: uiState.assembly,
    template: uiState.template,
    seed: uiState.seed,
    overrides: uiState.overrides,
  });

const setPreservedQuery = (params: URLSearchParams): void => {
  for (const fittedAttachment of initialQuery.getAll('fit')) {
    params.append('fit', fittedAttachment);
  }
  const viewerQuery = new URLSearchParams(location.search);
  const cycle = viewerQuery.get('cycle');
  const cycleSpeed = Number(viewerQuery.get('cycleSpeed'));
  if (cycle === 'fire' || cycle === 'hand') {
    params.set('cycle', cycle);
  }
  if ([1, 0.25, 0.1, 0.02].includes(cycleSpeed)) {
    params.set('cycleSpeed', String(cycleSpeed));
  }
  for (const key of ['ammo', 'ammoCase', 'mag'] as const) {
    const value = initialQuery.get(key);
    if (value) {
      params.set(key, value);
    }
  }
  if (initialQuery.get('pose') === 'action-open') {
    params.set('pose', 'action-open');
  }
  if (revolveFacets !== DEFAULT_REVOLVE_FACETS) {
    params.set('facets', String(revolveFacets));
  }
};

const syncUrl = () => {
  const params = new URLSearchParams();
  setModelQuery(params);
  if (colorMode === 'role') {
    params.set('colors', 'role');
  }
  setPreservedQuery(params);
  params.set(
    'camera',
    serializeCameraState({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z],
    }),
  );
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
};

// ---- three.js setup ----

const renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0x16_18_1c);
scene.add(new HemisphereLight(0xdf_e6_ee, 0x2a_26_22, 1.6));
const sun = new DirectionalLight(0xff_ff_ff, 2.2);
sun.position.set(20, 40, 30);
scene.add(sun);
const ammoCartridge = cartridges.find((cartridge) => cartridge.id === initialQuery.get('ammo'));
const caseFinish = caseFinishFromQuery(initialQuery.get('ammoCase'));
const ammoEnv = ammoCartridge ? ammoEnvironment(renderer) : undefined;
const ammoMeshes: AmmoMeshes | undefined =
  ammoCartridge && ammoEnv ? buildAmmoMeshes(ammoCartridge, caseFinish, ammoEnv, revolveFacets) : undefined;
const showMagazine = initialQuery.has('mag');
const magazineView = initialQuery.get('mag');
if (ammoMeshes) {
  scene.add(ammoMeshes.loose, ammoMeshes.fired);
  const label = document.createElement('p');
  label.id = 'ammo-info';
  label.textContent = ammoCartridge?.designation ?? '';
  if (ammoCartridge?.kind === 'shotshell') {
    const proxy =
      ammoCartridge.closure.value === null
        ? 'Roll-crimp visual proxy (source closure unknown).'
        : `Visual ${ammoCartridge.closure.value}.`;
    label.textContent += ` Loaded ${ammoCartridge.length.loaded.value} mm; fired ${ammoCartridge.length.nominal.value} mm. ${proxy} Unsourced primer omitted; wall and materials are visual approximations.`;
  }
  $('description').insertAdjacentElement('afterend', label);
}
const grid = new GridHelper(120, 60, 0x3a_3f_46, 0x26_2a_30);
grid.position.y = -16;
scene.add(grid);

const camera = new PerspectiveCamera(40, 1, 0.1, 1000);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// OrbitControls handles keys only on the browser's delayed key-repeat cadence.
// Keep the camera's orbit relation intact while applying held arrow keys every frame.
const PAN_KEYS = new Set(['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown']);
const heldPanKeys = new Set<string>();
let shiftHeld = false;
const KEY_PAN_SPEED = 25; // world units per second
const KEY_TURN_SPEED = Math.PI / 2; // radians per second
const panDirection = new Vector3();
const panUp = new Vector3();
const orbitOffset = new Vector3();
const isEditingText = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);
globalThis.addEventListener('keydown', (event) => {
  if (event.key === 'Shift') {
    shiftHeld = true;
    return;
  }
  if (!PAN_KEYS.has(event.code) || isEditingText(event.target)) {
    return;
  }
  heldPanKeys.add(event.code);
  event.preventDefault();
});
globalThis.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') {
    shiftHeld = false;
  }
  heldPanKeys.delete(event.code);
});
globalThis.addEventListener('blur', () => {
  heldPanKeys.clear();
  shiftHeld = false;
});

let cameraUrlSyncQueued = false;
controls.addEventListener('change', () => {
  if (cameraUrlSyncQueued) {
    return;
  }
  cameraUrlSyncQueued = true;
  requestAnimationFrame(() => {
    cameraUrlSyncQueued = false;
    syncUrl();
  });
});

const panFromKeys = (seconds: number) => {
  const right = Number(heldPanKeys.has('ArrowRight')) - Number(heldPanKeys.has('ArrowLeft'));
  const up = Number(heldPanKeys.has('ArrowUp')) - Number(heldPanKeys.has('ArrowDown'));
  const turn = shiftHeld ? right : 0;
  const panRight = shiftHeld ? 0 : right;
  if (turn !== 0) {
    orbitOffset
      .copy(camera.position)
      .sub(controls.target)
      .applyAxisAngle(camera.up, -turn * KEY_TURN_SPEED * seconds);
    camera.position.copy(controls.target).add(orbitOffset);
    camera.lookAt(controls.target);
  }
  if (panRight === 0 && up === 0) {
    return;
  }
  camera.updateMatrixWorld();
  panDirection.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(panRight);
  if (shiftHeld) {
    panUp.copy(camera.up);
  } else {
    camera.getWorldDirection(panUp);
  }
  panUp.multiplyScalar(up);
  panDirection
    .add(panUp)
    .normalize()
    .multiplyScalar(KEY_PAN_SPEED * seconds);
  camera.position.add(panDirection);
  controls.target.add(panDirection);
};

const resize = () => {
  const { clientWidth: w, clientHeight: h } = view;
  renderer.setSize(w, h);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
};
resize();
new ResizeObserver(resize).observe(view);

const GROUP_LABELS: Readonly<Record<string, string>> = { archetype: 'Archetypes', broken: 'Broken (one rule each)' };

const templateForAssembly = (assembly: Assembly): Template | undefined =>
  TEMPLATES.find((template) => assembly.name === `archetype-${template.name}`);

const expectationNote = (expected: string[] | undefined, failed: string[]): string => {
  if (expected === undefined) {
    return '';
  }
  return expected.join() === failed.join()
    ? ' <span class="note">· as expected</span>'
    : ` <span class="fail">· expected ${expected.join(', ') || 'pass'}</span>`;
};

// ---- state ----

let current: Assembly | undefined;
let report: Report | undefined;
let layers: Layers | undefined;
let focused: Issue | undefined;
let framed = false;
/** The un-edited model panel overrides are measured against: a fixture, an upload, or a generated seed. */
let baseline: Assembly | undefined;
/** The template `current`/`baseline` were generated from, when they were. Undefined for fixtures and uploads. */
let activeTemplate: Template | undefined;
/** Connections the last panel edit pruned (a port the edited part no longer has), for the panel's note. */
let lastDropped: readonly Connection[] = [];
let editorState: DesignEditorState | undefined;
let activeDesign: { readonly name: string; loaded: DesignLoadResult } | undefined;
let pendingCamera: CameraState | undefined;
const cycleView = createCycleView();
let detachedMagazine: Group | undefined;

const clearLayers = (): void => {
  if (!layers) {
    return;
  }
  for (const group of Object.values(layers)) {
    scene.remove(group);
    disposeGroup(group);
  }
};

const redraw = () => {
  if (!report) {
    return;
  }
  clearLayers();
  const action = resolveGunAction(report.resolved);
  const contextTemplate = editorState?.template ?? activeTemplate;
  const preview = previewFittedAttachments(report, initialQuery.getAll('fit'));
  fitNotice.textContent = preview.ok ? '' : preview.message;
  fitNotice.hidden = preview.ok;
  const renderReport = preview.ok ? preview.report : report;
  const appearanceReport = {
    ...renderReport,
    resolved: withAttachmentInstanceAppearances(renderReport.resolved),
  };
  layers = buildLayers(
    appearanceReport,
    focused ? [focused] : report.issues,
    colorMode,
    {
      ...(contextTemplate ? { variant: contextTemplate.name } : {}),
      ...(editorState?.finish ? { finish: editorState.finish } : {}),
    },
    revolveFacets,
    initialQuery.get('pose') === 'action-open' ? actionOpenOffsets(action) : new Map(),
  );
  for (const [name, group] of Object.entries(layers)) {
    group.visible = layerToggles.find((t) => t.dataset.layer === name)?.checked ?? true;
    scene.add(group);
  }
  // A static full-rearward inspection pose must not become the hand-cycle's new home pose.
  cycleView.bind(
    layers.solids,
    appearanceReport.resolved,
    initialQuery.get('pose') === 'action-open' && action?.kind === 'pump' ? undefined : action,
  );
  if (ammoMeshes) {
    scene.add(ammoMeshes.loose, ammoMeshes.fired);
    placeAmmo(report);
  }
  placeDetachedMagazine(report, layers.solids);
  if (!framed) {
    frame(layers.solids);
    framed = true;
  }
};

const placeAmmo = (shown: Report): void => {
  if (!ammoMeshes) {
    return;
  }
  const [ejection] = [...shown.resolved.placed].flatMap(([part, transform]) =>
    (shown.resolved.defs.get(part)?.keepOuts ?? [])
      .filter((keepOut) => keepOut.kind === 'ejection')
      .map((keepOut) => worldBox(transform, keepOut.box)),
  );
  const [x, y, z] = ejection?.center ?? [0, 0, 6];
  const gap = 1.5;
  ammoMeshes.loose.position.set(x - ammoMeshes.lengthUnits / 2, y + gap, z);
  ammoMeshes.fired.position.set(x - ammoMeshes.caseLengthUnits / 2, y - gap, z);
};

const clearDetachedMagazine = (): void => {
  if (!detachedMagazine) {
    return;
  }
  scene.remove(detachedMagazine);
  disposeGroup(detachedMagazine);
  detachedMagazine = undefined;
};

const placeDetachedMagazine = (shown: Report, solids: Group): void => {
  clearDetachedMagazine();
  if (!(showMagazine && ammoCartridge?.kind === 'metallic' && ammoMeshes)) {
    delete view.dataset.magazineRounds;
    delete view.dataset.magazineView;
    return;
  }
  const detached = buildDetachedMagazine(shown, solids, ammoCartridge, ammoMeshes);
  if (!detached) {
    delete view.dataset.magazineRounds;
    return;
  }
  detachedMagazine = detached.group;
  scene.add(detachedMagazine);
  view.dataset.magazineRounds = String(detached.capacity);
  view.dataset.magazineView = magazineView ?? '';
};

const frame = (group: Object3D) => {
  group.updateMatrixWorld(true);
  const box = new Box3().setFromObject(group);
  if (box.isEmpty()) {
    return;
  }
  const sphere = box.getBoundingSphere(new Sphere());
  // Fit the bounding sphere to the narrower of the two fields of view.
  const vfov = MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const distance = sphere.radius / Math.sin(Math.min(vfov, hfov) / 2);
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).add(new Vector3(0.2, 0.3, 1).normalize().multiplyScalar(distance));
  controls.update();
};

/** Design-file issue and error counts, for the issues button. */
let designCounts = { warnings: 0, errors: 0 };

/**
 * A failed action (an unreadable upload, no valid seed) that has no model to show: the button goes to an error
 * state and the message is listed first in the overlay. The last good model stays displayed. The next
 * successful load() clears it.
 */
let notice: { readonly label: string; readonly message: string } | undefined;

const setOverlayOpen = (open: boolean, fromKeyboard = false) => {
  const wasInside = issuesOverlay.contains(document.activeElement);
  issuesOverlay.hidden = !open;
  issuesBtn.setAttribute('aria-expanded', String(open));
  if (open && fromKeyboard) {
    issuesOverlay.focus();
  } else if (!open && wasInside) {
    issuesBtn.focus();
  }
};
// detail is 0 for a keyboard-activated click (Enter or Space on the button).
issuesBtn.addEventListener('click', (event) => setOverlayOpen(Boolean(issuesOverlay.hidden), event.detail === 0));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    setOverlayOpen(false);
  }
});

const showNotice = (label: string, message: string) => {
  notice = { label, message };
  noticeEl.textContent = message;
  updateIssuesButton();
  setOverlayOpen(true);
};

const clearNotice = () => {
  notice = undefined;
  noticeEl.textContent = '';
};
document.addEventListener('pointerdown', (event) => {
  const target = event.target as Node;
  if (!(issuesOverlay.hidden || issuesOverlay.contains(target) || issuesBtn.contains(target))) {
    setOverlayOpen(false);
  }
});

/**
 * The always-present issues button: its size never changes, only its label and colour. The lists it opens live in
 * a fixed-position overlay, so nothing in the layout moves when issues appear or vanish.
 */
const updateIssuesButton = () => {
  let kind: 'idle' | 'pass' | 'warning' | 'fail' = 'idle';
  let label = 'Issues: -';
  const editable = Boolean(editorState?.template);
  const count = (report?.issues.length ?? 0) + designCounts.warnings;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (designCounts.errors > 0) {
    kind = 'fail';
    label = `✖ ${plural(designCounts.errors + (report && !editable ? report.issues.length : 0), 'error')}`;
  } else if (report) {
    if (count === 0) {
      kind = 'pass';
      label = 'Issues: 0';
    } else if (editable || report.ok) {
      kind = 'warning';
      label = `⚠ ${plural(count, 'warning')}`;
    } else {
      kind = 'fail';
      label = `✖ ${plural(count, 'error')}`;
    }
  }
  if (notice) {
    kind = 'fail';
    label = `✖ ${notice.label}`;
  }
  issuesBtn.textContent = label;
  issuesBtn.className = kind;
};

const renderPanel = (assembly: Assembly) => {
  if (!report) {
    return;
  }
  description.textContent = assembly.description ?? '';
  const failed = [...new Set(report.issues.map((i) => i.rule))].sort();
  const expected = assembly.expect ? [...assembly.expect].sort() : undefined;
  let verdict: string;
  if (report.ok) {
    verdict = '<span class="pass">PASS</span>';
  } else if (editorState?.template) {
    verdict = `<span class="warning">WARN</span> <span class="note">(${report.issues.length} issue${report.issues.length === 1 ? '' : 's'}; editing and draft saving remain enabled)</span>`;
  } else {
    verdict = `<span class="fail">FAIL</span> <span class="note">(${report.issues.length} issue${report.issues.length === 1 ? '' : 's'})</span>`;
  }
  const note = expectationNote(expected, failed);
  const actionOpen =
    initialQuery.get('pose') === 'action-open' && actionOpenOffsets(resolveGunAction(report.resolved)).size > 0;
  const poseNote = actionOpen
    ? '<span class="note"> · view-only full-rearward pump pose; validation and export remain at rest</span>'
    : '';
  status.innerHTML = verdict + note + poseNote;

  issueList.replaceChildren(
    ...report.issues.map((issue, index) => {
      const li = document.createElement('li');
      li.tabIndex = 0;
      li.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          li.click();
          // The list is rebuilt on activation; keep the keyboard position.
          (issueList.children[index] as HTMLElement | undefined)?.focus();
        }
      });
      const rule = document.createElement('span');
      rule.className = 'rule';
      rule.textContent = issue.rule;
      li.append(rule, issue.message);
      li.classList.toggle('active', focused === issue);
      li.classList.toggle('dim', focused !== undefined && focused !== issue);
      li.addEventListener('click', () => {
        focused = focused === issue ? undefined : issue;
        renderPanel(assembly);
        redraw();
      });
      return li;
    }),
  );
  updateIssuesButton();
};

const renderDesignInfo = () => {
  designInfo.replaceChildren();
  designWarnings.replaceChildren();
  designCounts = { warnings: 0, errors: 0 };
  designStatus.value = editorState?.status ?? 'draft';
  saveButton.disabled = !editorState?.template;
  saveMessage.textContent = editorState?.template
    ? ''
    : 'This assembly has no matching template and cannot be saved as a design.';
  if (!activeDesign) {
    updateIssuesButton();
    return;
  }
  const model = buildDesignViewModel(activeDesign.loaded, activeDesign.name);
  const line = (label: string, value: string): HTMLParagraphElement => {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}:`;
    p.append(strong, ` ${value}`);
    return p;
  };

  const heading = document.createElement('h2');
  heading.textContent = 'Design';
  designInfo.append(heading, line('Name', model.name));
  if (model.kind === 'fatal') {
    const error = document.createElement('p');
    error.className = 'design-error';
    error.textContent = `${model.errorCode}: ${model.errorMessage}`;
    designWarnings.append(error);
    designCounts = { warnings: 0, errors: 1 };
    if (model.declaredStatus) {
      designInfo.append(line('Declared status', model.declaredStatus));
    }
    updateIssuesButton();
    return;
  }

  designInfo.append(
    line('Template', model.template),
    line('Declared status', model.declaredStatus),
    line('Loaded status', model.loadedStatus),
  );
  const locks = document.createElement('p');
  const params = Object.entries(model.locks.params).flatMap(([part, names]) => names.map((name) => `${part}.${name}`));
  const optional = model.locks.optionalParts.map((part) => `${part} presence`);
  locks.textContent = `Locks: ${[...params, ...optional].join(', ') || 'none'}`;
  designInfo.append(locks);

  // Design warnings live in the issues overlay, not inline, so they never push the controls around.
  designCounts = { warnings: model.issues.length, errors: 0 };
  if (model.issues.length > 0) {
    const warningsHeading = document.createElement('h2');
    warningsHeading.textContent = 'Design warnings';
    const designIssues = document.createElement('ul');
    designIssues.className = 'design-issues design-warnings';
    for (const issue of model.issues) {
      const item = document.createElement('li');
      const code = document.createElement('code');
      code.textContent = issue.code;
      item.append(code, ` ${issue.message}`);
      if (issue.parts.length > 0) {
        item.append(` (${issue.parts.join(', ')})`);
      }
      designIssues.append(item);
    }
    designWarnings.append(warningsHeading, designIssues);
  }
  updateIssuesButton();
};

const clearRenderedModel = () => {
  if (detachedMagazine) {
    scene.remove(detachedMagazine);
    disposeGroup(detachedMagazine);
    detachedMagazine = undefined;
  }
  if (ammoMeshes) {
    scene.remove(ammoMeshes.loose, ammoMeshes.fired);
  }
  if (layers) {
    for (const group of Object.values(layers)) {
      scene.remove(group);
      disposeGroup(group);
    }
  }
  layers = undefined;
  current = undefined;
  report = undefined;
  focused = undefined;
  framed = false;
  paramPanel.replaceChildren();
  description.textContent = '';
  status.textContent = '';
  issueList.replaceChildren();
  clearNotice();
  updateIssuesButton();
};

const load = (assembly: Assembly) => {
  current = assembly;
  if (editorState) {
    editorState = withEditorAssembly(editorState, assembly);
  }
  if (activeDesign && editorState) {
    const saved = saveDesign(editorState, gunDomain);
    if (saved.ok) {
      activeDesign.loaded = loadGunDesign(saved.text);
    }
  }
  report = validate(assembly, gunDomain);
  focused = undefined;
  clearNotice();
  renderPanel(assembly);
  renderDesignInfo();
  redraw();
  if (pendingCamera) {
    const { position, target } = pendingCamera;
    pendingCamera = undefined;
    camera.position.set(...position);
    controls.target.set(...target);
    controls.update();
  }
  renderParamPanel();
};

// ---- parameter panel ----
//
// Lists the current model's parts and params (paramPanel.ts, pure), then
// turns a click into a new Assembly and runs it through the same load() as
// picking a fixture: no second code path (PROJECT.md item gungen5).

const paramStateText = (state: PanelParam['state']): string => {
  if (state.kind === 'inherited') {
    return `← ${state.from}`;
  }
  return state.kind === 'user' ? 'set' : 'seed';
};

interface PartWarning {
  readonly code: string;
  readonly message: string;
}

/**
 * A card's title row. Warnings and the prefab note are small badges with tooltips in this one-line row, so a
 * warning appearing never changes the card's height.
 */
const cardTitle = (
  entry: PanelEntry,
  warnings: readonly PartWarning[] = [],
  prefab?: PanelPart['prefab'],
): HTMLDivElement => {
  const title = document.createElement('div');
  title.className = 'part-title';
  const id = document.createElement('span');
  id.className = 'part-id';
  id.textContent = entry.id;
  title.append(id);
  if (prefab) {
    const badge = document.createElement('span');
    badge.className = prefab.stale ? 'part-badge part-prefab stale' : 'part-badge part-prefab';
    badge.textContent = prefab.stale ? 'prefab · stale' : 'prefab';
    badge.title = `prefab: ${prefab.label}${prefab.stale ? ' · stale' : ''}\nfixes ${Object.entries(prefab.fixedParams)
      .map(([name, value]) => `${name}=${value}`)
      .join(', ')}`;
    title.append(badge);
  }
  if (warnings.length > 0) {
    const badge = document.createElement('span');
    badge.className = 'part-badge part-warnings';
    badge.textContent = `⚠ ${warnings.length}`;
    badge.title = warnings.map((w) => `${w.code}: ${w.message}`).join('\n');
    title.append(badge);
  }
  const family = document.createElement('span');
  family.className = 'family';
  family.textContent = entry.family;
  title.append(family);
  return title;
};

/** An optional slot the current model doesn't use, with a button to add it. */
const renderSlotCard = (
  entry: PanelSlot,
  warnings: readonly { readonly code: string; readonly message: string }[] = [],
): HTMLElement => {
  const card = document.createElement('fieldset');
  card.className = 'param-part optional';
  card.append(cardTitle(entry, warnings));
  const row = document.createElement('div');
  row.className = 'param-slot';
  const note = document.createElement('span');
  note.className = 'param-state';
  note.textContent = 'not present';
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Add';
  add.addEventListener('click', () => {
    if (editorState) {
      const next = setOptionalPart(editorState, entry.id, true);
      applyPanelChange(next.assembly, [], next);
    }
  });
  const lock = document.createElement('button');
  lock.type = 'button';
  lock.className = 'lock-toggle';
  lock.textContent = editorState?.locks.optionalParts.includes(entry.id) ? '🔒' : 'Lock';
  lock.setAttribute('aria-pressed', String(editorState?.locks.optionalParts.includes(entry.id) ?? false));
  lock.title = 'Lock this optional part’s presence';
  lock.addEventListener('click', () => {
    if (editorState) {
      applyPanelChange(editorState.assembly, [], toggleOptionalPartLock(editorState, entry.id));
    }
  });
  row.append(note, add, lock);
  card.append(row);
  return card;
};

/** One param: its state, a clear button when a user override, and a button per allowed value. */
const renderParamRow = (partId: string, param: PanelParam): HTMLElement => {
  const row = document.createElement('div');
  row.className = 'param-row';

  const head = document.createElement('div');
  head.className = 'param-head';
  const label = document.createElement('span');
  label.textContent = param.name;
  const state = document.createElement('span');
  state.className = `param-state ${param.state.kind}`;
  state.textContent = paramStateText(param.state);
  head.append(label, state);
  const lock = document.createElement('button');
  lock.type = 'button';
  lock.className = 'lock-toggle';
  const locked = editorState?.locks.params[partId]?.includes(param.name) ?? false;
  lock.textContent = locked ? '🔒' : 'Lock';
  lock.setAttribute('aria-pressed', String(locked));
  lock.title = `${locked ? 'Unlock' : 'Lock'} ${partId}.${param.name}`;
  lock.addEventListener('click', () => {
    if (editorState) {
      const next = toggleParamLock(editorState, gunDomain, partId, param.name);
      applyPanelChange(next.assembly, [], next);
    }
  });
  head.append(lock);
  if (param.state.kind === 'user') {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'clear';
    clear.textContent = '×';
    clear.title = 'Clear override, restoring the seed value';
    clear.addEventListener('click', () => {
      if (editorState) {
        const cleared = clearEditorParam(editorState, gunDomain, { baseline: baseline!, partId, name: param.name });
        applyPanelChange(cleared.assembly, cleared.dropped, cleared.state);
      } else {
        const { assembly, dropped } = clearParam(current!, gunDomain, baseline!, { part: partId, name: param.name });
        applyPanelChange(assembly, dropped);
      }
    });
    head.append(clear);
  }
  row.append(head);

  const values = document.createElement('div');
  values.className = 'param-values';
  for (const v of param.values) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = v.value;
    btn.classList.toggle('active', v.value === param.current);
    btn.classList.toggle('not-permitted', v.permitted === false);
    if (v.permitted === false) {
      btn.title = "The current template's choices for this param don't offer this value.";
    }
    btn.addEventListener('click', () => {
      if (editorState) {
        const edited = editParam(editorState, gunDomain, { partId, name: param.name, value: v.value });
        applyPanelChange(edited.assembly, edited.dropped, edited.state);
      } else {
        const { assembly, dropped } = setParam(current!, gunDomain, { part: partId, name: param.name }, v.value);
        applyPanelChange(assembly, dropped);
      }
    });
    values.append(btn);
  }
  row.append(values);
  return row;
};

const renderOptionalPartActions = (entry: PanelPart): HTMLElement => {
  const presence = document.createElement('div');
  presence.className = 'param-part-actions';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Remove';
  remove.addEventListener('click', () => {
    if (editorState) {
      const next = setOptionalPart(editorState, entry.id, false);
      applyPanelChange(next.assembly, [], next);
    }
  });
  const lock = document.createElement('button');
  lock.type = 'button';
  lock.className = 'lock-toggle';
  const locked = editorState?.locks.optionalParts.includes(entry.id) ?? false;
  lock.textContent = locked ? '🔒 presence' : 'Lock presence';
  lock.setAttribute('aria-pressed', String(locked));
  lock.addEventListener('click', () => {
    if (editorState) {
      applyPanelChange(editorState.assembly, [], toggleOptionalPartLock(editorState, entry.id));
    }
  });
  presence.append(remove, lock);
  return presence;
};

const renderPrefabPicker = (entry: PanelPart): HTMLElement | undefined => {
  if (!editorState) {
    return undefined;
  }
  const prefabs = availablePrefabs(editorState, entry.id);
  if (prefabs.length === 0) {
    return undefined;
  }
  const picker = document.createElement('label');
  picker.className = 'prefab-picker';
  picker.append('Prefab ');
  const selectPrefab = document.createElement('select');
  selectPrefab.setAttribute('aria-label', `${entry.id} prefab`);
  selectPrefab.append(new Option('None', ''));
  for (const prefab of prefabs) {
    selectPrefab.append(new Option(`${prefab.id} v${prefab.version}`, `${prefab.id}@${prefab.version}`));
  }
  const currentRef = current?.parts[entry.id]?.prefab;
  selectPrefab.value = currentRef ? `${currentRef.id}@${currentRef.version}` : '';
  selectPrefab.addEventListener('change', () => {
    if (!editorState) {
      return;
    }
    if (!selectPrefab.value) {
      const next = clearPrefab(editorState, entry.id);
      applyPanelChange(next.assembly, [], next);
      return;
    }
    const [id, version] = selectPrefab.value.split('@');
    const prefab = prefabs.find((candidate) => candidate.id === id && candidate.version === Number(version));
    if (!prefab) {
      return;
    }
    const result = choosePrefab(editorState, entry.id, prefab);
    if (result.ok) {
      applyPanelChange(result.state.assembly, [], result.state);
    }
  });
  picker.append(selectPrefab);
  return picker;
};

/** A present part: an optional Remove button, then every param row. */
const renderPartCard = (
  entry: PanelPart,
  warnings: readonly { readonly code: string; readonly message: string }[] = [],
): HTMLElement => {
  const card = document.createElement('fieldset');
  card.className = entry.optional ? 'param-part optional' : 'param-part';
  card.append(cardTitle(entry, warnings, entry.prefab));
  if (entry.optional) {
    card.append(renderOptionalPartActions(entry));
  }
  const picker = renderPrefabPicker(entry);
  if (picker) {
    card.append(picker);
  }
  for (const param of entry.params) {
    card.append(renderParamRow(entry.id, param));
  }
  return card;
};

const warningsForPart = (
  model: ReturnType<typeof buildDesignViewModel> | undefined,
  partId: string,
): readonly { readonly code: string; readonly message: string }[] =>
  model?.kind === 'loaded' ? (model.issuesByPart[partId] ?? []) : [];

const renderParamPanel = () => {
  if (!(current && baseline)) {
    paramPanel.replaceChildren();
    return;
  }
  const currentDesign = editorState ? saveDesign(editorState, gunDomain) : undefined;
  const designResult = activeDesign?.loaded ?? (currentDesign?.ok ? loadGunDesign(currentDesign.text) : undefined);
  const designModel = designResult
    ? buildDesignViewModel(designResult, activeDesign?.name ?? current?.name ?? 'design')
    : undefined;
  const model = buildPanelModel(current, baseline, gunDomain, {
    template: activeTemplate,
    prefabsByPart: designModel?.kind === 'loaded' ? designModel.prefabsByPart : {},
  });
  const nodes: HTMLElement[] = [];

  // The meta card is always the first cell and has a fixed size: its button greys out and its note text
  // changes, but it never adds or removes a grid cell.
  const edited = hasOverrides(diffOverrides(baseline, current));
  const meta = document.createElement('fieldset');
  meta.className = 'param-part param-meta';
  const metaTitle = document.createElement('div');
  metaTitle.className = 'part-title';
  const metaName = document.createElement('span');
  metaName.textContent = 'edits';
  metaTitle.append(metaName);
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'param-reset';
  reset.textContent = 'Reset to seed';
  reset.disabled = !edited;
  reset.addEventListener('click', () => applyPanelChange(structuredClone(baseline!)));
  const note = document.createElement('p');
  note.className = 'param-note';
  if (lastDropped.length > 0) {
    note.classList.add('dropped');
    note.textContent = lastDropped
      .map((c) => `removed connection ${c.from} → ${c.to}: port no longer exists`)
      .join('; ');
    note.title = note.textContent;
  } else {
    note.textContent = edited ? 'Edited from the seed.' : 'No edits.';
  }
  meta.append(metaTitle, reset, note);
  nodes.push(meta);
  for (const entry of model) {
    nodes.push(
      entry.present
        ? renderPartCard(entry, warningsForPart(designModel, entry.id))
        : renderSlotCard(entry, warningsForPart(designModel, entry.id)),
    );
  }
  paramPanel.replaceChildren(...nodes);
};

const applyPanelChange = (next: Assembly, dropped: readonly Connection[] = [], nextEditorState?: DesignEditorState) => {
  if (!baseline) {
    return;
  }
  // Keep the camera where the user put it: an edit changes the model, not the view.
  lastDropped = dropped;
  editorState = nextEditorState ?? (editorState ? withEditorAssembly(editorState, next) : undefined);
  uiState.overrides = diffOverrides(baseline, next);
  saveUiState();
  syncUrl();
  load(next);
};

// ---- UI wiring ----

const applyEditorOverrides = (state: DesignEditorState, overrides: typeof EMPTY_OVERRIDES): DesignEditorState => {
  let next = state;
  for (const [slot, present] of Object.entries(overrides.presence)) {
    next = setOptionalPart(next, slot, present);
  }
  for (const [part, params] of Object.entries(overrides.params)) {
    for (const [name, value] of Object.entries(params)) {
      next = editParam(next, gunDomain, { partId: part, name, value }).state;
    }
  }
  return next;
};

const openDesign = (name: string, overrides = EMPTY_OVERRIDES) => {
  const file = designs.find((candidate) => candidate.name === name);
  const source: DesignLoadResult = file
    ? loadGunDesign(file.text)
    : {
        ok: false,
        declaredStatus: undefined,
        error: { code: 'invalid-shape', message: `design file "${name}.json" was not found` },
      };
  activeDesign = { name, loaded: source };
  uiState.overrides = overrides;
  select.value = `design:${name}`;
  lastDropped = [];
  if (!source.ok) {
    baseline = undefined;
    activeTemplate = undefined;
    editorState = undefined;
    clearRenderedModel();
    renderDesignInfo();
    syncUrl();
    saveUiState();
    return;
  }

  baseline = source.design.assembly;
  activeTemplate = TEMPLATES.find((template) => template.name === source.design.template);
  if (activeTemplate) {
    templateSelect.value = activeTemplate.name;
  }
  const declaredDesign = { ...source.design, status: source.declaredStatus };
  editorState = applyEditorOverrides(editorStateFromDesign(declaredDesign, activeTemplate), overrides);
  load(editorState.assembly);
  syncUrl();
  saveUiState();
};

const groups = new Map<string, HTMLOptGroupElement>();
for (const f of fixtures) {
  const kind = f.name.split('-')[0]!;
  let group = groups.get(kind);
  if (!group) {
    group = document.createElement('optgroup');
    group.label = GROUP_LABELS[kind] ?? kind;
    groups.set(kind, group);
    select.append(group);
  }
  group.append(new Option(f.name, f.name));
}
const designGroup = document.createElement('optgroup');
designGroup.label = 'Designs';
for (const design of designs) {
  designGroup.append(new Option(design.name, `design:${design.name}`));
}
select.append(designGroup);
select.addEventListener('change', () => {
  if (select.value.startsWith('design:')) {
    openDesign(select.value.slice('design:'.length));
    return;
  }
  const f = fixtures.find((x) => x.name === select.value);
  if (!f) {
    return;
  }
  framed = false;
  activeDesign = undefined;
  activeTemplate = templateForAssembly(f);
  editorState = createEditorState(activeTemplate, f);
  renderDesignInfo();
  uiState.assembly = { kind: 'fixture', name: f.name };
  uiState.overrides = EMPTY_OVERRIDES;
  baseline = f;
  lastDropped = [];
  saveUiState();
  syncUrl();
  load(f);
});

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    return;
  }
  try {
    const text = await file.text();
    const loadedDesign = loadGunDesign(text);
    framed = false;
    uiState.assembly = { kind: 'upload' };
    uiState.overrides = EMPTY_OVERRIDES;
    lastDropped = [];
    if (loadedDesign.ok) {
      const name = file.name.replace(DESIGN_EXTENSION, '');
      activeDesign = { name, loaded: loadedDesign };
      activeTemplate = TEMPLATES.find((template) => template.name === loadedDesign.design.template);
      if (activeTemplate) {
        templateSelect.value = activeTemplate.name;
      }
      const design = { ...loadedDesign.design, status: loadedDesign.declaredStatus };
      editorState = editorStateFromDesign(design, activeTemplate);
      baseline = design.assembly;
      select.querySelector('option[value=""]')?.remove();
      select.add(new Option(`${name} (design file)`, ''), 0);
      select.selectedIndex = 0;
      saveUiState();
      syncUrl();
      load(editorState.assembly);
      return;
    }
    const parsed = parseAssemblyJson(text);
    if (!parsed.ok) {
      showNotice('Could not read file', `Could not read ${file.name}: ${formatParseError(parsed.error)}`);
      return;
    }
    const { assembly } = parsed;
    activeDesign = undefined;
    activeTemplate = templateForAssembly(assembly);
    editorState = createEditorState(activeTemplate, assembly);
    renderDesignInfo();
    select.querySelector('option[value=""]')?.remove();
    select.add(new Option(`${assembly.name} (file)`, ''), 0);
    select.selectedIndex = 0;
    baseline = assembly;
    saveUiState();
    syncUrl();
    load(assembly);
  } catch (err) {
    showNotice('Could not read file', `Could not read ${file.name}: ${(err as Error).message}`);
  }
});

for (const t of layerToggles) {
  t.addEventListener('change', () => {
    const layer = t.dataset.layer as keyof UiState['layers'];
    uiState.layers[layer] = t.checked;
    saveUiState();
    const group = layers?.[layer];
    if (group) {
      group.visible = t.checked;
    }
  });
}

// Name whatever is under the pointer.
const raycaster = new Raycaster();
const pointer = new Vector2();
renderer.domElement.addEventListener('pointermove', (e) => {
  if (!layers) {
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  // Solids win over the translucent keep-out volumes around them.
  const hit = [layers.solids, layers.keepOuts]
    .filter((g) => g.visible)
    .map((g) => raycaster.intersectObject(g, true).find((h) => h.object.userData.label))
    .find((h) => h !== undefined);
  hover.textContent = hit ? String(hit.object.userData.label) : '';
});

// ---- generation ----

for (const t of TEMPLATES) {
  templateSelect.add(new Option(t.name, t.name));
}

if (TEMPLATES.some((t) => t.name === uiState.template)) {
  templateSelect.value = uiState.template;
} else {
  uiState.template = DEFAULT_UI_STATE.template;
  templateSelect.value = uiState.template;
}
seedInput.value = uiState.seed;
onlyValid.checked = uiState.onlyValid;
for (const t of layerToggles) {
  const layer = t.dataset.layer as keyof UiState['layers'];
  t.checked = uiState.layers[layer];
}

/** Walks seed, seed ± 1, … in the step's direction until a valid build turns up, or gives up after 100 tries. */
const findValidSeed = (template: Template, seed: number, step: number): ReturnType<typeof generateValid> => {
  const dir = step < 0 ? -1 : 1;
  for (let i = 0; i < 100; i++) {
    const g = generateValid(template, gunDomain, seed + dir * i, 1);
    if (g) {
      return g;
    }
  }
  return undefined;
};

/**
 * Generates the seed's assembly (the new baseline) and, unless
 * `preserveOverrides`, drops any panel overrides — a new seed is a new
 * baseline to explore. `preserveOverrides` is for restoring a session
 * (uiState or the URL already carries the overrides to reapply).
 */
const runGenerator = (step = 0, preserveOverrides = false) => {
  const template = TEMPLATES.find((t) => t.name === templateSelect.value);
  if (!template) {
    return;
  }
  let seed = (Number.parseInt(seedInput.value, 10) || 0) + step;
  let generated: Assembly;
  if (onlyValid.checked) {
    const found = findValidSeed(template, seed, step);
    if (!found) {
      showNotice('No valid seed', `No valid ${template.name} within 100 seeds of ${seed}.`);
      return;
    }
    ({ seed, assembly: generated } = found);
  } else {
    generated = generate(template, gunDomain, seed);
  }
  seedInput.value = String(seed);
  activeDesign = undefined;
  uiState.assembly = { kind: 'generated' };
  uiState.template = template.name;
  uiState.seed = String(seed);
  uiState.onlyValid = onlyValid.checked;
  if (!preserveOverrides) {
    uiState.overrides = EMPTY_OVERRIDES;
  }
  baseline = generated;
  activeTemplate = template;
  editorState = createEditorState(template, generated, {
    ...(template.calibre === undefined ? {} : { calibre: template.calibre }),
    origin: { template: template.name, seed, overrides: uiState.overrides },
  });
  if (hasOverrides(uiState.overrides)) {
    editorState = applyEditorOverrides(editorState, uiState.overrides);
  }
  lastDropped = [];
  renderDesignInfo();
  const { assembly } = editorState;
  const option = new Option(`${assembly.name} (generated)`, '');
  select.querySelector('option[value=""]')?.remove();
  select.add(option, 0);
  select.selectedIndex = 0;
  saveUiState();
  syncUrl();
  load(assembly);
};

templateSelect.addEventListener('change', () => {
  framed = false;
  uiState.template = templateSelect.value;
  saveUiState();
  runGenerator();
});
$<HTMLButtonElement>('generate-btn').addEventListener('click', () => runGenerator());
$<HTMLButtonElement>('next-seed').addEventListener('click', () => runGenerator(1));
$<HTMLButtonElement>('prev-seed').addEventListener('click', () => runGenerator(-1));
seedInput.addEventListener('change', () => {
  uiState.seed = seedInput.value;
  saveUiState();
  runGenerator();
});
onlyValid.addEventListener('change', () => {
  uiState.onlyValid = onlyValid.checked;
  saveUiState();
});

designStatus.addEventListener('change', () => {
  if (!editorState) {
    return;
  }
  editorState = withEditorStatus(editorState, designStatus.value as 'draft' | 'published');
  if (current) {
    load(current);
  }
});

saveButton.addEventListener('click', () => {
  if (!editorState) {
    return;
  }
  const requestedState = withEditorStatus(editorState, designStatus.value as 'draft' | 'published');
  const saved = saveDesignForDownload(requestedState, gunDomain);
  if (!saved.ok) {
    saveMessage.textContent = 'This assembly has no template and cannot be saved as a design.';
    return;
  }
  const publicationNotice = saved.downgraded
    ? ' Saved as draft because validation found issues; npm run check:designs is the publish gate.'
    : '';
  if (saved.downgraded) {
    editorState = withEditorStatus(requestedState, 'draft');
    designStatus.value = 'draft';
    renderDesignInfo();
  }
  const url = URL.createObjectURL(new Blob([saved.text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${saved.design.assembly.name.replace(/[^a-z0-9_-]+/gi, '-') || saved.design.template}.json`;
  a.click();
  URL.revokeObjectURL(url);
  saveMessage.textContent = `Downloaded ${a.download}.${publicationNotice}`;
});

// ?fixture=<name> opens a fixture; ?design=<name> loads a curated design;
// ?template=<name>&seed=<n> generates one. AK/AR views also accept ?cycle=fire|hand&cycleSpeed=0.02.
// `&pose=action-open` is a pump-only, view-only full rearward pose.
// Each can add &set=<part.param:value,...> to override params, or
// &set=<part:on|off> to force an optional part in or out (paramPanel.ts).
const query = new URLSearchParams(location.search);
pendingCamera = parseCameraState(query.get('camera'));
const querySet = query.get('set');
const hasModelQuery = query.has('design') || query.has('template') || query.has('fixture');
uiState.overrides = initialOverrides(
  uiState.overrides,
  querySet === null ? undefined : parseOverrides(querySet),
  hasModelQuery,
);
const initialTemplate = TEMPLATES.find((t) => t.name === query.get('template'));
const queryFixture = fixtures.find((f) => f.name === query.get('fixture'));
const queryDesign = query.get('design');
if (queryDesign !== null) {
  openDesign(queryDesign, uiState.overrides);
} else if (initialTemplate) {
  templateSelect.value = initialTemplate.name;
  seedInput.value = query.get('seed') ?? '0';
  uiState.template = initialTemplate.name;
  uiState.seed = seedInput.value;
  uiState.assembly = { kind: 'generated' };
  runGenerator(0, true);
} else if (queryFixture) {
  select.value = queryFixture.name;
  uiState.assembly = { kind: 'fixture', name: queryFixture.name };
  baseline = queryFixture;
  activeTemplate = templateForAssembly(queryFixture);
  editorState = createEditorState(activeTemplate, queryFixture);
  if (hasOverrides(uiState.overrides)) {
    editorState = applyEditorOverrides(editorState, uiState.overrides);
  }
  lastDropped = [];
  saveUiState();
  syncUrl();
  load(editorState.assembly);
} else if (uiState.assembly.kind === 'generated') {
  runGenerator(0, true);
} else {
  const storedFixtureName = uiState.assembly.kind === 'fixture' ? uiState.assembly.name : undefined;
  const storedFixture = fixtures.find((f) => f.name === storedFixtureName);
  const start = storedFixture ?? fixtures.find((f) => f.name === 'archetype-battle-rifle') ?? fixtures[0];
  if (start) {
    select.value = start.name;
    uiState.assembly = { kind: 'fixture', name: start.name };
    baseline = start;
    activeTemplate = templateForAssembly(start);
    editorState = createEditorState(activeTemplate, start);
    if (hasOverrides(uiState.overrides)) {
      editorState = applyEditorOverrides(editorState, uiState.overrides);
    }
    lastDropped = [];
    saveUiState();
    syncUrl();
    load(editorState.assembly);
  } else {
    saveUiState();
  }
}

let previousFrameMs = performance.now();
renderer.setAnimationLoop((frameMs) => {
  const elapsedSeconds = Math.min((frameMs - previousFrameMs) / 1000, 0.1);
  previousFrameMs = frameMs;
  panFromKeys(elapsedSeconds);
  cycleView.frame(elapsedSeconds);
  controls.update();
  renderer.render(scene, camera);
});
