// Transitional optical effects and carry adapter; physical actor colour belongs to PlayerMeshes.

import { opticApertureDistance } from '@skelly/thing-core/optic-aperture';
import {
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  RingGeometry,
  Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { FigureDef } from '../core/content.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { isInHeldItemSlotTree } from '../core/itemTree.ts';
import type { MeleePoseFrame } from '../core/meleePose.ts';
import { mountedOptic, type OpticLensFrame, opticViewSettings, projectLensAperture } from '../core/opticView.ts';
import { PLAYER_VIEW_FOV_DEGREES } from '../core/opticWindow.ts';
import { ActorAnimator, type ActorItemPose, type HeldHandlingFrame } from './actorAnimator.ts';
import { HeldPresentation } from './heldPresentation.ts';
import { modelMaterialWarmUp } from './modelMaterials.ts';
import { LENS, type ModelLibrary } from './models.ts';
import { firstPersonShoulder } from './playerFigure.ts';
import type { SkyTargets } from './sky.ts';

export type { HeldFirearmPose, HeldHandlingFrame } from './actorAnimator.ts';

const HELD_ROOT_PATH = /^inventory\.hands\.(left|right)\./;

/** Transitional view adapter: physical animation belongs to ActorAnimator, optical effects stay here. */
export class HeldItems {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(PLAYER_VIEW_FOV_DEGREES, 1, 0.01, 10);
  private readonly view = new Group();
  private readonly carried = new Group();
  private readonly torso = new Group();
  private readonly physical = new Group();
  private readonly light = new DirectionalLight();
  private readonly ambient = new HemisphereLight();
  private skyVisibility = 1;
  private readonly animator: ActorAnimator;
  private readonly presentation: HeldPresentation;
  private visor: Object3D | undefined;
  private readonly visorMaterials: MeshBasicMaterial[] = [];
  private drawn = '';
  private readonly opticWindow = new Mesh(
    new RingGeometry(0.01, 0.011, 64),
    new MeshBasicMaterial({
      color: 0x0b_0c_0d,
      side: DoubleSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  private opticWindowShape = '';
  private opticViewFrame: OpticLensFrame | undefined;

  private readonly inventory: Inventory;
  private readonly models: ModelLibrary | undefined;
  private readonly figure: FigureDef;
  private readonly sunSource: DirectionalLight | undefined;

  constructor(inventory: Inventory, models: ModelLibrary | undefined, figure: FigureDef, sunSource?: DirectionalLight) {
    this.inventory = inventory;
    this.models = models;
    this.figure = figure;
    this.sunSource = sunSource;
    this.view.name = 'held-items-view';
    this.physical.name = 'held-optical-source';
    // The retained animator supplies optics only, never another visible arm/item owner.
    this.physical.visible = false;
    const presentation = new HeldPresentation(inventory.registry, figure, models, {
      frame: this.physical,
      torso: this.torso,
    });
    this.presentation = presentation;
    this.animator = new ActorAnimator(inventory, presentation, (side) => this.viewShoulder(side));
    if (sunSource) {
      this.light.shadow = sunSource.shadow;
      this.light.castShadow = sunSource.castShadow;
    }
    this.opticWindow.visible = false;
    this.opticWindow.renderOrder = 100;
    this.physical.add(this.torso);
    this.view.add(this.opticWindow, this.carried);
    this.scene.add(
      this.view,
      this.physical,
      this.light,
      this.ambient,
      this.camera,
      presentation.warmUp(),
      modelMaterialWarmUp(false),
    );
  }

  attach(object: Object3D): void {
    this.carried.add(object);
  }

  get warmUpTarget(): { scene: Scene; camera: PerspectiveCamera } {
    return { scene: this.scene, camera: this.camera };
  }

  update(
    main: PerspectiveCamera,
    pose?: MeleePoseFrame,
    recoil = 0,
    handling: HeldHandlingFrame = { firearms: [] },
  ): void {
    const version = `${this.inventory.version}:${this.models?.version ?? 0}`;
    if (version !== this.drawn) {
      this.drawn = version;
      this.syncVisor();
    }
    this.opticWindow.visible = false;
    this.opticViewFrame = undefined;
    this.presentation.stockSeats = handling.stockSeats;
    this.view.position.copy(main.position);
    if (handling.sourceEyeMetres) {
      this.view.position.set(...handling.sourceEyeMetres);
    }
    this.view.quaternion.copy(main.quaternion);
    this.animator.update(
      { position: this.view.position, quaternion: main.quaternion, rotation: main.rotation },
      {
        pose,
        recoil,
        handling,
        viewPlacement: {
          poseItem: (frame) => this.poseOptic(frame, main),
        },
      },
    );
    this.presentation.syncWorn(this.inventory);
    this.camera.position.copy(main.position);
    this.camera.quaternion.copy(main.quaternion);
  }

  private poseOptic(
    { item, modelDefinition, aimingDownSights, firearmPose, transform, rotation, handling }: ActorItemPose,
    main: PerspectiveCamera,
  ): void {
    const optic = mountedOptic(this.inventory.registry, item);
    const base = optic && opticViewSettings(optic.item, optic.model);
    const zoom = handling.opticZoom;
    const settings =
      base && zoom?.uid === item.uid && zoom.opticUid === optic?.uid
        ? { ...base, magnification: zoom.magnification }
        : base;
    const active = Boolean(aimingDownSights && modelDefinition?.gun?.sight?.kind === 'optic' && settings);
    const heldModel = this.animator.modelOf(item);
    if (heldModel) {
      heldModel.visible = !active;
    }
    const diameter = modelDefinition?.gun?.sight?.ocularDiameterMetres;
    if (
      !(
        active &&
        settings &&
        diameter !== undefined &&
        firearmPose?.sightEyeOffset &&
        firearmPose.sightDirection &&
        firearmPose.sightUp
      )
    ) {
      return;
    }
    const distance = modelDefinition!.gun!.sight!.eyeReliefMetres;
    const innerRadius = diameter / 2;
    const outerRadius = innerRadius * 1.12;
    const shape = `${innerRadius}:${outerRadius}:${settings.aperture.aspectRatio}:${settings.aperture.exponent}`;
    if (shape !== this.opticWindowShape) {
      this.opticWindow.geometry.dispose();
      const geometry = new RingGeometry(innerRadius, outerRadius, 64);
      const positions = geometry.getAttribute('position');
      for (let index = 0; index < positions.count; index++) {
        const x = positions.getX(index);
        const y = positions.getY(index);
        const radius = Math.hypot(x, y);
        const scale = 1 / opticApertureDistance(x / radius, y / radius, settings.aperture);
        positions.setXY(index, x * scale, y * scale);
      }
      geometry.computeBoundingSphere();
      this.opticWindow.geometry = geometry;
      this.opticWindowShape = shape;
    }
    const matrix = new Matrix4().makeBasis(
      ...(firearmPose.rootRotation.map((axis) => new Vector3(...axis)) as [Vector3, Vector3, Vector3]),
    );
    const inverse = new Quaternion().setFromRotationMatrix(matrix).invert();
    const forward = new Vector3(...firearmPose.sightDirection)
      .applyQuaternion(inverse)
      .applyQuaternion(rotation)
      .normalize();
    const up = new Vector3(...firearmPose.sightUp).applyQuaternion(inverse).applyQuaternion(rotation).normalize();
    const right = new Vector3().crossVectors(forward, up).normalize();
    up.crossVectors(right, forward).normalize();
    this.opticWindow.quaternion.setFromRotationMatrix(matrix.makeBasis(right, up, forward.clone().negate()));
    const eyeOffset = new Vector3(...firearmPose.sightEyeOffset).applyQuaternion(inverse).applyQuaternion(rotation);
    this.opticWindow.position
      .set(...transform.offset)
      .add(eyeOffset)
      .addScaledVector(forward, distance);
    this.opticWindow.visible = true;
    const center = main.worldToLocal(this.view.localToWorld(this.opticWindow.position.clone()));
    const aperture = projectLensAperture({
      center: [center.x, center.y, center.z],
      right: [right.x, right.y, right.z],
      up: [up.x, up.y, up.z],
      radius: innerRadius,
      verticalFovDegrees: main.fov,
      aspect: main.aspect,
    });
    if (aperture) {
      this.opticViewFrame = { ...settings, ...aperture };
    }
  }

  get opticLensFrame(): OpticLensFrame | undefined {
    return this.opticViewFrame;
  }

  viewShoulder(side: HandSide): Vector3 {
    return new Vector3(...firstPersonShoulder(this.figure, side));
  }

  private shownModelOf(item: Item): Object3D | undefined {
    const own = this.animator.modelOf(item);
    if (own) {
      return own;
    }
    for (const { item: found, path } of this.inventory.carriedTree()) {
      if (found === item) {
        const side = isInHeldItemSlotTree(path) ? (HELD_ROOT_PATH.exec(path)?.[1] as HandSide | undefined) : undefined;
        const root = side && this.inventory.hands[side];
        return root ? this.animator.modelOf(root) : undefined;
      }
    }
    return undefined;
  }

  lensOf(item: Item, out: Vector3): boolean {
    const lens = this.shownModelOf(item)?.getObjectByName(LENS);
    if (!lens) {
      return false;
    }
    lens.getWorldPosition(out);
    return true;
  }

  lightPositionOf(item: Item, out: Vector3): boolean {
    const visual = this.animator.modelOf(item);
    if (!visual) {
      return false;
    }
    if (!this.lensOf(item, out)) {
      visual.getWorldPosition(out);
    }
    return true;
  }

  setSkyVisibility(visibility: number): void {
    this.skyVisibility = visibility;
  }

  render(renderer: WebGLRenderer, main: PerspectiveCamera, sky: SkyTargets): void {
    this.light.position.copy(sky.light.position);
    this.light.color.copy(sky.light.color);
    this.light.intensity = sky.light.intensity;
    this.light.castShadow = this.sunSource?.castShadow ?? false;
    this.ambient.color.copy(sky.ambient.color);
    this.ambient.groundColor.copy(sky.ambient.groundColor);
    this.ambient.intensity = sky.ambient.intensity * this.skyVisibility;
    if (this.camera.fov !== main.fov || this.camera.aspect !== main.aspect) {
      this.camera.fov = main.fov;
      this.camera.aspect = main.aspect;
      this.camera.updateProjectionMatrix();
    }
    this.visor?.scale.set(
      this.camera.aspect * Math.tan(MathUtils.degToRad(this.camera.fov / 2)),
      Math.tan(MathUtils.degToRad(this.camera.fov / 2)),
      1,
    );
    const { autoClear } = renderer;
    const opticVisible = this.opticWindow.visible;
    const cameraVisible = this.camera.visible;
    const carriedVisible = this.carried.visible;
    renderer.autoClear = false;
    try {
      if (carriedVisible && this.carried.children.some((child) => child.visible)) {
        this.opticWindow.visible = false;
        this.camera.visible = false;
        renderer.render(this.scene, main);
        this.opticWindow.visible = opticVisible;
        this.camera.visible = cameraVisible;
      }
      this.carried.visible = false;
      renderer.render(this.scene, this.camera);
    } finally {
      this.opticWindow.visible = opticVisible;
      this.camera.visible = cameraVisible;
      this.carried.visible = carriedVisible;
      renderer.autoClear = autoClear;
    }
  }

  private clearVisor(): void {
    this.visor?.removeFromParent();
    this.visor = undefined;
    for (const material of this.visorMaterials) {
      material.dispose();
    }
    this.visorMaterials.length = 0;
  }

  private syncVisor(): void {
    this.clearVisor();
    const { head } = this.inventory.worn;
    const entry = head && defOf(this.inventory.registry, head.type).wearable?.viewModel;
    const model = entry && this.models?.part(entry.model);
    if (!(entry && model)) {
      return;
    }
    model.traverse((object) => {
      if (!(object instanceof Mesh)) {
        return;
      }
      const source = Array.isArray(object.material) ? object.material[0] : object.material;
      const material = new MeshBasicMaterial({
        color: source.color,
        transparent: true,
        opacity: object.name === 'pane' ? entry.tint : entry.darkening,
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
      });
      object.material = material;
      this.visorMaterials.push(material);
    });
    this.visor = model;
    this.camera.add(model);
  }

  dispose(): void {
    this.clearVisor();
    this.animator.dispose();
    this.opticWindow.geometry.dispose();
    (this.opticWindow.material as MeshBasicMaterial).dispose();
    this.drawn = '';
  }
}
