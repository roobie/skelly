import { RawBroadPhase } from "../raw";
import { RayColliderHit, RayColliderIntersection } from "./ray";
import { RotationOps, VectorOps } from "../math";
import { PointColliderProjection } from "./point";
import { ColliderShapeCastHit } from "./toi";
export class BroadPhase {
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    constructor(raw) {
        this.raw = raw || new RawBroadPhase();
    }
    castRay(narrowPhase, bodies, colliders, ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        let rawOrig = VectorOps.intoRaw(ray.origin);
        let rawDir = VectorOps.intoRaw(ray.dir);
        let result = RayColliderHit.fromRaw(colliders, this.raw.castRay(narrowPhase.raw, bodies.raw, colliders.raw, rawOrig, rawDir, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate));
        rawOrig.free();
        rawDir.free();
        return result;
    }
    castRayAndGetNormal(narrowPhase, bodies, colliders, ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        let rawOrig = VectorOps.intoRaw(ray.origin);
        let rawDir = VectorOps.intoRaw(ray.dir);
        let result = RayColliderIntersection.fromRaw(colliders, this.raw.castRayAndGetNormal(narrowPhase.raw, bodies.raw, colliders.raw, rawOrig, rawDir, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate));
        rawOrig.free();
        rawDir.free();
        return result;
    }
    intersectionsWithRay(narrowPhase, bodies, colliders, ray, maxToi, solid, callback, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        let rawOrig = VectorOps.intoRaw(ray.origin);
        let rawDir = VectorOps.intoRaw(ray.dir);
        let rawCallback = (rawInter) => {
            return callback(RayColliderIntersection.fromRaw(colliders, rawInter));
        };
        this.raw.intersectionsWithRay(narrowPhase.raw, bodies.raw, colliders.raw, rawOrig, rawDir, maxToi, solid, rawCallback, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate);
        rawOrig.free();
        rawDir.free();
    }
    intersectionWithShape(narrowPhase, bodies, colliders, shapePos, shapeRot, shape, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        let rawPos = VectorOps.intoRaw(shapePos);
        let rawRot = RotationOps.intoRaw(shapeRot);
        let rawShape = shape.intoRaw();
        let result = this.raw.intersectionWithShape(narrowPhase.raw, bodies.raw, colliders.raw, rawPos, rawRot, rawShape, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate);
        rawPos.free();
        rawRot.free();
        rawShape.free();
        return result;
    }
    projectPoint(narrowPhase, bodies, colliders, point, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        let rawPoint = VectorOps.intoRaw(point);
        let result = PointColliderProjection.fromRaw(colliders, this.raw.projectPoint(narrowPhase.raw, bodies.raw, colliders.raw, rawPoint, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate));
        rawPoint.free();
        return result;
    }
    projectPointAndGetFeature(narrowPhase, bodies, colliders, point, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        let rawPoint = VectorOps.intoRaw(point);
        let result = PointColliderProjection.fromRaw(colliders, this.raw.projectPointAndGetFeature(narrowPhase.raw, bodies.raw, colliders.raw, rawPoint, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate));
        rawPoint.free();
        return result;
    }
    intersectionsWithPoint(narrowPhase, bodies, colliders, point, callback, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        let rawPoint = VectorOps.intoRaw(point);
        this.raw.intersectionsWithPoint(narrowPhase.raw, bodies.raw, colliders.raw, rawPoint, callback, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate);
        rawPoint.free();
    }
    castShape(narrowPhase, bodies, colliders, shapePos, shapeRot, shapeVel, shape, targetDistance, maxToi, stopAtPenetration, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        let rawPos = VectorOps.intoRaw(shapePos);
        let rawRot = RotationOps.intoRaw(shapeRot);
        let rawVel = VectorOps.intoRaw(shapeVel);
        let rawShape = shape.intoRaw();
        let result = ColliderShapeCastHit.fromRaw(colliders, this.raw.castShape(narrowPhase.raw, bodies.raw, colliders.raw, rawPos, rawRot, rawVel, rawShape, targetDistance, maxToi, stopAtPenetration, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate));
        rawPos.free();
        rawRot.free();
        rawVel.free();
        rawShape.free();
        return result;
    }
    intersectionsWithShape(narrowPhase, bodies, colliders, shapePos, shapeRot, shape, callback, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) {
        let rawPos = VectorOps.intoRaw(shapePos);
        let rawRot = RotationOps.intoRaw(shapeRot);
        let rawShape = shape.intoRaw();
        this.raw.intersectionsWithShape(narrowPhase.raw, bodies.raw, colliders.raw, rawPos, rawRot, rawShape, callback, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate);
        rawPos.free();
        rawRot.free();
        rawShape.free();
    }
    collidersWithAabbIntersectingAabb(narrowPhase, bodies, colliders, aabbCenter, aabbHalfExtents, callback) {
        let rawCenter = VectorOps.intoRaw(aabbCenter);
        let rawHalfExtents = VectorOps.intoRaw(aabbHalfExtents);
        this.raw.collidersWithAabbIntersectingAabb(narrowPhase.raw, bodies.raw, colliders.raw, rawCenter, rawHalfExtents, callback);
        rawCenter.free();
        rawHalfExtents.free();
    }
}
