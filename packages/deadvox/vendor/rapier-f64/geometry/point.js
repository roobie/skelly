import { VectorOps } from "../math";
import { FeatureType } from "./feature";
export class PointProjection {
    constructor(point, isInside) {
        this.point = point;
        this.isInside = isInside;
    }
    static fromRaw(raw) {
        if (!raw)
            return null;
        const result = new PointProjection(VectorOps.fromRaw(raw.point()), raw.isInside());
        raw.free();
        return result;
    }
}
export class PointColliderProjection {
    constructor(collider, point, isInside, featureType, featureId) {
        this.featureType = FeatureType.Unknown;
        this.featureId = undefined;
        this.collider = collider;
        this.point = point;
        this.isInside = isInside;
        if (featureId !== undefined)
            this.featureId = featureId;
        if (featureType !== undefined)
            this.featureType = featureType;
    }
    static fromRaw(colliderSet, raw) {
        if (!raw)
            return null;
        const result = new PointColliderProjection(colliderSet.get(raw.colliderHandle()), VectorOps.fromRaw(raw.point()), raw.isInside(), raw.featureType(), raw.featureId());
        raw.free();
        return result;
    }
}
