import { RawBroadPhase } from "../raw";
import { RigidBodyHandle, RigidBodySet } from "../dynamics";
import { ColliderSet } from "./collider_set";
import { Ray, RayColliderHit, RayColliderIntersection } from "./ray";
import { InteractionGroups } from "./interaction_groups";
import { ColliderHandle } from "./collider";
import { Rotation, Vector } from "../math";
import { Shape } from "./shape";
import { PointColliderProjection } from "./point";
import { ColliderShapeCastHit } from "./toi";
import { QueryFilterFlags } from "../pipeline";
import { NarrowPhase } from "./narrow_phase";
export declare class BroadPhase {
    raw: RawBroadPhase;
    free(): void;
    constructor(raw?: RawBroadPhase);
    castRay(narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, ray: Ray, maxToi: number, solid: boolean, filterFlags?: QueryFilterFlags, filterGroups?: InteractionGroups, filterExcludeCollider?: ColliderHandle, filterExcludeRigidBody?: RigidBodyHandle, filterPredicate?: (collider: ColliderHandle) => boolean): RayColliderHit | null;
    castRayAndGetNormal(narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, ray: Ray, maxToi: number, solid: boolean, filterFlags?: QueryFilterFlags, filterGroups?: InteractionGroups, filterExcludeCollider?: ColliderHandle, filterExcludeRigidBody?: RigidBodyHandle, filterPredicate?: (collider: ColliderHandle) => boolean, target?: RayColliderIntersection): RayColliderIntersection | null;
    intersectionsWithRay(narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, ray: Ray, maxToi: number, solid: boolean, callback: (intersect: RayColliderIntersection) => boolean, filterFlags?: QueryFilterFlags, filterGroups?: InteractionGroups, filterExcludeCollider?: ColliderHandle, filterExcludeRigidBody?: RigidBodyHandle, filterPredicate?: (collider: ColliderHandle) => boolean): void;
    intersectionWithShape(narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, shapePos: Vector, shapeRot: Rotation, shape: Shape, filterFlags?: QueryFilterFlags, filterGroups?: InteractionGroups, filterExcludeCollider?: ColliderHandle, filterExcludeRigidBody?: RigidBodyHandle, filterPredicate?: (collider: ColliderHandle) => boolean): ColliderHandle | null;
    projectPoint(narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, point: Vector, solid: boolean, filterFlags?: QueryFilterFlags, filterGroups?: InteractionGroups, filterExcludeCollider?: ColliderHandle, filterExcludeRigidBody?: RigidBodyHandle, filterPredicate?: (collider: ColliderHandle) => boolean, target?: PointColliderProjection): PointColliderProjection | null;
    projectPointAndGetFeature(narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, point: Vector, filterFlags?: QueryFilterFlags, filterGroups?: InteractionGroups, filterExcludeCollider?: ColliderHandle, filterExcludeRigidBody?: RigidBodyHandle, filterPredicate?: (collider: ColliderHandle) => boolean, target?: PointColliderProjection): PointColliderProjection | null;
    intersectionsWithPoint(narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, point: Vector, callback: (handle: ColliderHandle) => boolean, filterFlags?: QueryFilterFlags, filterGroups?: InteractionGroups, filterExcludeCollider?: ColliderHandle, filterExcludeRigidBody?: RigidBodyHandle, filterPredicate?: (collider: ColliderHandle) => boolean): void;
    castShape(narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, shapePos: Vector, shapeRot: Rotation, shapeVel: Vector, shape: Shape, targetDistance: number, maxToi: number, stopAtPenetration: boolean, filterFlags?: QueryFilterFlags, filterGroups?: InteractionGroups, filterExcludeCollider?: ColliderHandle, filterExcludeRigidBody?: RigidBodyHandle, filterPredicate?: (collider: ColliderHandle) => boolean, target?: ColliderShapeCastHit): ColliderShapeCastHit | null;
    intersectionsWithShape(narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, shapePos: Vector, shapeRot: Rotation, shape: Shape, callback: (handle: ColliderHandle) => boolean, filterFlags?: QueryFilterFlags, filterGroups?: InteractionGroups, filterExcludeCollider?: ColliderHandle, filterExcludeRigidBody?: RigidBodyHandle, filterPredicate?: (collider: ColliderHandle) => boolean): void;
    collidersWithAabbIntersectingAabb(narrowPhase: NarrowPhase, bodies: RigidBodySet, colliders: ColliderSet, aabbCenter: Vector, aabbHalfExtents: Vector, callback: (handle: ColliderHandle) => boolean): void;
}
