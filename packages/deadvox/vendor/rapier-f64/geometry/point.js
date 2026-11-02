import { VectorOps, scratchBuffer } from "../math";
import { FeatureType } from "./feature";
export class PointProjection {
    constructor(point, isInside) {
        this.point = point;
        this.isInside = isInside;
    }
    static fromBuffer(raw, target) {
        if (!raw)
            return null;
        raw.point(scratchBuffer);
        target ?? (target = new PointProjection(VectorOps.zeros(), false));
        target.point = VectorOps.fromBuffer(scratchBuffer, target.point);
        target.isInside = raw.isInside();
        raw.free();
        return target;
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
    static fromBuffer(colliderSet, raw, target) {
        if (!raw)
            return null;
        raw.point(scratchBuffer);
        target ?? (target = new PointColliderProjection(null, VectorOps.zeros(), false));
        target.collider = colliderSet.get(raw.colliderHandle());
        target.point = VectorOps.fromBuffer(scratchBuffer, target.point);
        target.isInside = raw.isInside();
        target.featureType = raw.featureType();
        target.featureId = raw.featureId();
        raw.free();
        return target;
    }
}
