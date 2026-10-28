// Transitional optical effects and carry adapter; physical actor colour belongs to PlayerMeshes.

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
  Scene,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { FigureDef } from '../core/content.ts';
import { CORE_CONTENT_IDS } from '../core/contentIds.ts';
import { heldAdsStandoffMetres, heldTorsoForwardDegrees } from '../core/heldPose.ts';
import type { HandSide, Inventory } from '../core/inventory.ts';
import { defOf, type Item } from '../core/items.ts';
import { isInHeldItemSlotTree } from '../core/itemTree.ts';
import type { MeleePoseFrame } from '../core/meleePose.ts';
import { type OpticLensFrame, presentedOptic, projectLensAperture, projectOpticReticle } from '../core/opticView.ts';
import { PLAYER_VIEW_FOV_DEGREES } from '../core/opticWindow.ts';
import { ActorAnimator, type ActorItemPose, type HeldHandlingFrame } from './actorAnimator.ts';
import { HeldPresentation } from './heldPresentation.ts';
import { modelMaterialWarmUp } from './modelMaterials.ts';
import { LENS, type ModelLibrary } from './models.ts';
import { firstPersonShoulder, heldBodyShoulder } from './playerFigure.ts';
import type { SkyTargets } from './sky.ts';

export type { HeldFirearmPose, HeldHandlingFrame } from './actorAnimator.ts';

const HELD_ROOT_PATH = /^inventory\.hands\.(left|right)\./;

/** Transitional view adapter: physical animation belongs to ActorAnimator, optical effects stay here. */
export class HeldItems {
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
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
  private opticViewFrame: OpticLensFrame | undefined;

  private readonly inventory: Inventory;
  private readonly models: ModelLibrary | undefined;
  private readonly figure: FigureDef;
  private readonly sunSource: DirectionalLight | undefined;

  constructor(
    inventory: Inventory,
    models: ModelLibrary | undefined,
    figure: FigureDef,
    { nearPlaneMetres, sunSource }: { nearPlaneMetres: number; sunSource?: DirectionalLight },
  ) {
    this.inventory = inventory;
    this.camera = new PerspectiveCamera(PLAYER_VIEW_FOV_DEGREES, 1, nearPlaneMetres, 10);
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
    this.physical.add(this.torso);
    this.view.add(this.carried);
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
    handling: HeldHandlingFrame & { poseSource?: HeldPresentation | undefined } = { firearms: [] },
  ): void {
    const version = `${this.inventory.version}:${this.models?.version ?? 0}`;
    if (version !== this.drawn) {
      this.drawn = version;
      this.syncVisor();
    }
    this.opticViewFrame = undefined;
    this.presentation.stockSeats = handling.stockSeats;
    this.presentation.proneAds = handling.proneAds ?? false;
    this.presentation.adsEyes = handling.adsEyes;
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
        poseSource: handling.poseSource,
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
    const settings = presentedOptic(this.inventory.registry, {
      item,
      modelDefinition,
      aimingDownSights,
      zoom: handling.opticZoom,
    })?.settings;
    const heldModel = this.animator.modelOf(item);
    if (heldModel) {
      heldModel.visible = !settings || modelDefinition?.hands?.adsStandoffByPitch !== undefined;
    }
    const diameter = modelDefinition?.gun?.sight?.ocularDiameterMetres;
    if (
      !(
        settings &&
        diameter !== undefined &&
        firearmPose?.sightEyeOffset &&
        firearmPose.sightDirection &&
        firearmPose.sightUp
      )
    ) {
      return;
    }
    const distance =
      modelDefinition?.hands?.adsViewEyeReliefMetres ??
      (modelDefinition?.hands?.adsStandoffByPitch
        ? heldAdsStandoffMetres(modelDefinition, main.rotation.x)
        : modelDefinition!.gun!.sight!.eyeReliefMetres);
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
    const eyeOffset = new Vector3(...firearmPose.sightEyeOffset).applyQuaternion(inverse).applyQuaternion(rotation);
    const glass = new Vector3(...transform.offset).add(eyeOffset).addScaledVector(forward, distance);
    const center = main.worldToLocal(this.view.localToWorld(glass));
    const aperture = projectLensAperture({
      center: [center.x, center.y, center.z],
      right: [right.x, right.y, right.z],
      up: [up.x, up.y, up.z],
      radius: diameter / 2,
      verticalFovDegrees: main.fov,
      aspect: main.aspect,
    });
    // The view group shares the main camera's orientation, so `forward` is already camera-local.
    const reticleCenter = projectOpticReticle(
      [forward.x, forward.y, forward.z],
      main.fov,
      main.aspect,
      settings.magnification,
    );
    if (aperture && reticleCenter) {
      this.opticViewFrame = { ...settings, ...aperture, reticleCenter };
    }
  }

  get opticLensFrame(): OpticLensFrame | undefined {
    return this.opticViewFrame;
  }

  viewShoulder(side: HandSide): Vector3 {
    const lean = heldTorsoForwardDegrees(this.inventory);
    const shoulder = lean
      ? heldBodyShoulder(this.figure, this.inventory.registry.models, side, {
          eyeMetres: this.inventory.registry.player.get(CORE_CONTENT_IDS.player)!.eye,
          leanDegrees: lean,
        })
      : firstPersonShoulder(this.figure, side);
    return new Vector3(...shoulder);
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
    const cameraVisible = this.camera.visible;
    const carriedVisible = this.carried.visible;
    renderer.autoClear = false;
    try {
      if (carriedVisible && this.carried.children.some((child) => child.visible)) {
        this.camera.visible = false;
        renderer.render(this.scene, main);
        this.camera.visible = cameraVisible;
      }
      this.carried.visible = false;
      renderer.render(this.scene, this.camera);
    } finally {
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
    this.drawn = '';
  }
}
