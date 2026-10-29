import { Collider } from "./collider";
import { Vector } from "../math";
import { RawPointColliderProjection, RawPointProjection } from "../raw";
import { FeatureType } from "./feature";
import { ColliderSet } from "./collider_set";
export declare class PointProjection {
    point: Vector;
    isInside: boolean;
    constructor(point: Vector, isInside: boolean);
    static fromBuffer(raw: RawPointProjection, target?: PointProjection): PointProjection;
}
export declare class PointColliderProjection {
    collider: Collider;
    point: Vector;
    isInside: boolean;
    featureType: FeatureType;
    featureId: number | undefined;
    constructor(collider: Collider, point: Vector, isInside: boolean, featureType?: FeatureType, featureId?: number);
    static fromBuffer(colliderSet: ColliderSet, raw: RawPointColliderProjection, target?: PointColliderProjection): PointColliderProjection;
}
