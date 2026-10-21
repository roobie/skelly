import { VectorOps } from "../math";
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
    static fromRaw(raw) {
        if (!raw)
            return null;
        const result = new RayIntersection(raw.time_of_impact(), VectorOps.fromRaw(raw.normal()), raw.featureType(), raw.featureId());
        raw.free();
        return result;
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
    static fromRaw(colliderSet, raw) {
        if (!raw)
            return null;
        const result = new RayColliderIntersection(colliderSet.get(raw.colliderHandle()), raw.time_of_impact(), VectorOps.fromRaw(raw.normal()), raw.featureType(), raw.featureId());
        raw.free();
        return result;
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
