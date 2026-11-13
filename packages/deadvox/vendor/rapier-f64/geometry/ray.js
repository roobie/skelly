import { VectorOps, scratchBuffer } from "../math";
import { FeatureType } from "./feature";
export class Ray {
    constructor(origin, dir) {
        this.origin = origin;
        this.dir = dir;
    }
    pointAt(t) {
        return {
            x: this.origin.x + this.dir.x * t,
            y: this.origin.y + this.dir.y * t,
            z: this.origin.z + this.dir.z * t,
        };
    }
}
export class RayIntersection {
    constructor(timeOfImpact, normal, featureType, featureId) {
        this.featureType = FeatureType.Unknown;
        this.featureId = undefined;
        this.timeOfImpact = timeOfImpact;
        this.normal = normal;
        if (featureId !== undefined)
            this.featureId = featureId;
        if (featureType !== undefined)
            this.featureType = featureType;
    }
    static fromBuffer(raw, target) {
        if (!raw)
            return null;
        raw.normal(scratchBuffer);
        target ?? (target = new RayIntersection(0, VectorOps.zeros()));
        target.timeOfImpact = raw.time_of_impact();
        target.normal = VectorOps.fromBuffer(scratchBuffer, target.normal);
        target.featureType = raw.featureType();
        target.featureId = raw.featureId();
        raw.free();
        return target;
    }
}
export class RayColliderIntersection {
    constructor(collider, timeOfImpact, normal, featureType, featureId) {
        this.featureType = FeatureType.Unknown;
        this.featureId = undefined;
        this.collider = collider;
        this.timeOfImpact = timeOfImpact;
        this.normal = normal;
        if (featureId !== undefined)
            this.featureId = featureId;
        if (featureType !== undefined)
            this.featureType = featureType;
    }
    static fromBuffer(colliderSet, raw, target) {
        if (!raw)
            return null;
        raw.normal(scratchBuffer);
        target ?? (target = new RayColliderIntersection(null, 0, VectorOps.zeros()));
        target.collider = colliderSet.get(raw.colliderHandle());
        target.timeOfImpact = raw.time_of_impact();
        target.normal = VectorOps.fromBuffer(scratchBuffer, target.normal);
        target.featureType = raw.featureType();
        target.featureId = raw.featureId();
        raw.free();
        return target;
    }
}
export class RayColliderHit {
    constructor(collider, timeOfImpact) {
        this.collider = collider;
        this.timeOfImpact = timeOfImpact;
    }
    static fromRaw(colliderSet, raw) {
        if (!raw)
            return null;
        const result = new RayColliderHit(colliderSet.get(raw.colliderHandle()), raw.timeOfImpact());
        raw.free();
        return result;
    }
}
