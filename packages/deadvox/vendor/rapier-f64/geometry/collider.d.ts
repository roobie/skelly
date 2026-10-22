import { Rotation, Vector } from "../math";
import { CoefficientCombineRule, RigidBody, RigidBodySet } from "../dynamics";
import { ActiveHooks, ActiveEvents } from "../pipeline";
import { InteractionGroups } from "./interaction_groups";
import { Shape, ShapeType, TriMeshFlags, HeightFieldFlags } from "./shape";
import { Ray, RayIntersection } from "./ray";
import { PointProjection } from "./point";
import { ColliderShapeCastHit, ShapeCastHit } from "./toi";
import { ShapeContact } from "./contact";
import { ColliderSet } from "./collider_set";
export declare enum ActiveCollisionTypes {
    DYNAMIC_DYNAMIC = 1,
    DYNAMIC_KINEMATIC = 12,
    DYNAMIC_FIXED = 2,
    KINEMATIC_KINEMATIC = 52224,
    KINEMATIC_FIXED = 8704,
    FIXED_FIXED = 32,
    DEFAULT = 15,
    ALL = 60943
}
export type ColliderHandle = number;
export declare class Collider {
    private colliderSet;
    readonly handle: ColliderHandle;
    private _shape;
    private _parent;
    constructor(colliderSet: ColliderSet, handle: ColliderHandle, parent: RigidBody | null, shape?: Shape);
    finalizeDeserialization(bodies: RigidBodySet): void;
    private ensureShapeIsCached;
    get shape(): Shape;
    clearShapeCache(): void;
    isValid(): boolean;
    translation(): Vector;
    translationWrtParent(): Vector | null;
    rotation(): Rotation;
    rotationWrtParent(): Rotation | null;
    isSensor(): boolean;
    setSensor(isSensor: boolean): void;
    setShape(shape: Shape): void;
    setEnabled(enabled: boolean): void;
    isEnabled(): boolean;
    setRestitution(restitution: number): void;
    setFriction(friction: number): void;
    frictionCombineRule(): CoefficientCombineRule;
    setFrictionCombineRule(rule: CoefficientCombineRule): void;
    restitutionCombineRule(): CoefficientCombineRule;
    setRestitutionCombineRule(rule: CoefficientCombineRule): void;
    setCollisionGroups(groups: InteractionGroups): void;
    setSolverGroups(groups: InteractionGroups): void;
    contactSkin(): number;
    setContactSkin(thickness: number): void;
    activeHooks(): ActiveHooks;
    setActiveHooks(activeHooks: ActiveHooks): void;
    activeEvents(): ActiveEvents;
    setActiveEvents(activeEvents: ActiveEvents): void;
    activeCollisionTypes(): ActiveCollisionTypes;
    setContactForceEventThreshold(threshold: number): void;
    contactForceEventThreshold(): number;
    setActiveCollisionTypes(activeCollisionTypes: ActiveCollisionTypes): void;
    setDensity(density: number): void;
    setMass(mass: number): void;
    setMassProperties(mass: number, centerOfMass: Vector, principalAngularInertia: Vector, angularInertiaLocalFrame: Rotation): void;
    setTranslation(tra: Vector): void;
    setTranslationWrtParent(tra: Vector): void;
    setRotation(rot: Rotation): void;
    setRotationWrtParent(rot: Rotation): void;
    shapeType(): ShapeType;
    halfExtents(): Vector;
    setHalfExtents(newHalfExtents: Vector): void;
    radius(): number;
    setRadius(newRadius: number): void;
    roundRadius(): number;
    setRoundRadius(newBorderRadius: number): void;
    halfHeight(): number;
    setHalfHeight(newHalfheight: number): void;
    setVoxel(ix: number, iy: number, iz: number, filled: boolean): void;
    propagateVoxelChange(voxels2: Collider, ix: number, iy: number, iz: number, shift_x: number, shift_y: number, shift_z: number): void;
    combineVoxelStates(voxels2: Collider, shift_x: number, shift_y: number, shift_z: number): void;
    vertices(): Float64Array;
    indices(): Uint32Array | undefined;
    heightfieldHeights(): Float64Array;
    heightfieldScale(): Vector;
    heightfieldNRows(): number;
    heightfieldNCols(): number;
    parent(): RigidBody | null;
    friction(): number;
    restitution(): number;
    density(): number;
    mass(): number;
    volume(): number;
    collisionGroups(): InteractionGroups;
    solverGroups(): InteractionGroups;
    containsPoint(point: Vector): boolean;
    projectPoint(point: Vector, solid: boolean): PointProjection | null;
    intersectsRay(ray: Ray, maxToi: number): boolean;
    castShape(collider1Vel: Vector, shape2: Shape, shape2Pos: Vector, shape2Rot: Rotation, shape2Vel: Vector, targetDistance: number, maxToi: number, stopAtPenetration: boolean): ShapeCastHit | null;
    castCollider(collider1Vel: Vector, collider2: Collider, collider2Vel: Vector, targetDistance: number, maxToi: number, stopAtPenetration: boolean): ColliderShapeCastHit | null;
    intersectsShape(shape2: Shape, shapePos2: Vector, shapeRot2: Rotation): boolean;
    contactShape(shape2: Shape, shape2Pos: Vector, shape2Rot: Rotation, prediction: number): ShapeContact | null;
    contactCollider(collider2: Collider, prediction: number): ShapeContact | null;
    castRay(ray: Ray, maxToi: number, solid: boolean): number;
    castRayAndGetNormal(ray: Ray, maxToi: number, solid: boolean): RayIntersection | null;
}
export declare enum MassPropsMode {
    Density = 0,
    Mass = 1,
    MassProps = 2
}
export declare class ColliderDesc {
    enabled: boolean;
    shape: Shape;
    massPropsMode: MassPropsMode;
    mass: number;
    centerOfMass: Vector;
    principalAngularInertia: Vector;
    angularInertiaLocalFrame: Rotation;
    density: number;
    friction: number;
    restitution: number;
    rotation: Rotation;
    translation: Vector;
    isSensor: boolean;
    collisionGroups: InteractionGroups;
    solverGroups: InteractionGroups;
    frictionCombineRule: CoefficientCombineRule;
    restitutionCombineRule: CoefficientCombineRule;
    activeEvents: ActiveEvents;
    activeHooks: ActiveHooks;
    activeCollisionTypes: ActiveCollisionTypes;
    contactForceEventThreshold: number;
    contactSkin: number;
    constructor(shape: Shape);
    static ball(radius: number): ColliderDesc;
    static capsule(halfHeight: number, radius: number): ColliderDesc;
    static segment(a: Vector, b: Vector): ColliderDesc;
    static triangle(a: Vector, b: Vector, c: Vector): ColliderDesc;
    static roundTriangle(a: Vector, b: Vector, c: Vector, borderRadius: number): ColliderDesc;
    static polyline(vertices: Float64Array, indices?: Uint32Array | null): ColliderDesc;
    static voxels(voxels: Float64Array | Int32Array, voxelSize: Vector): ColliderDesc;
    static trimesh(vertices: Float64Array, indices: Uint32Array, flags?: TriMeshFlags): ColliderDesc;
    static cuboid(hx: number, hy: number, hz: number): ColliderDesc;
    static roundCuboid(hx: number, hy: number, hz: number, borderRadius: number): ColliderDesc;
    static heightfield(nrows: number, ncols: number, heights: Float64Array, scale: Vector, flags?: HeightFieldFlags): ColliderDesc;
    static cylinder(halfHeight: number, radius: number): ColliderDesc;
    static roundCylinder(halfHeight: number, radius: number, borderRadius: number): ColliderDesc;
    static cone(halfHeight: number, radius: number): ColliderDesc;
    static roundCone(halfHeight: number, radius: number, borderRadius: number): ColliderDesc;
    static convexHull(points: Float64Array): ColliderDesc | null;
    static convexMesh(vertices: Float64Array, indices?: Uint32Array | null): ColliderDesc | null;
    static roundConvexHull(points: Float64Array, borderRadius: number): ColliderDesc | null;
    static roundConvexMesh(vertices: Float64Array, indices: Uint32Array | null, borderRadius: number): ColliderDesc | null;
    setTranslation(x: number, y: number, z: number): ColliderDesc;
    setRotation(rot: Rotation): ColliderDesc;
    setSensor(sensor: boolean): ColliderDesc;
    setEnabled(enabled: boolean): ColliderDesc;
    setContactSkin(thickness: number): ColliderDesc;
    setDensity(density: number): ColliderDesc;
    setMass(mass: number): ColliderDesc;
    setMassProperties(mass: number, centerOfMass: Vector, principalAngularInertia: Vector, angularInertiaLocalFrame: Rotation): ColliderDesc;
    setRestitution(restitution: number): ColliderDesc;
    setFriction(friction: number): ColliderDesc;
    setFrictionCombineRule(rule: CoefficientCombineRule): ColliderDesc;
    setRestitutionCombineRule(rule: CoefficientCombineRule): ColliderDesc;
    setCollisionGroups(groups: InteractionGroups): ColliderDesc;
    setSolverGroups(groups: InteractionGroups): ColliderDesc;
    setActiveHooks(activeHooks: ActiveHooks): ColliderDesc;
    setActiveEvents(activeEvents: ActiveEvents): ColliderDesc;
    setActiveCollisionTypes(activeCollisionTypes: ActiveCollisionTypes): ColliderDesc;
    setContactForceEventThreshold(threshold: number): ColliderDesc;
}
