import { Vector } from "../math";
import { RawRayColliderIntersection, RawRayColliderHit, RawRayIntersection } from "../raw";
import { Collider } from "./collider";
import { FeatureType } from "./feature";
import { ColliderSet } from "./collider_set";
export declare class Ray {
    origin: Vector;
    dir: Vector;
    constructor(origin: Vector, dir: Vector);
    pointAt(t: number): Vector;
}
export declare class RayIntersection {
    timeOfImpact: number;
    normal: Vector;
    featureType: FeatureType;
    featureId: number | undefined;
    constructor(timeOfImpact: number, normal: Vector, featureType?: FeatureType, featureId?: number);
    static fromRaw(raw: RawRayIntersection): RayIntersection;
}
export declare class RayColliderIntersection {
    collider: Collider;
    timeOfImpact: number;
    normal: Vector;
    featureType: FeatureType;
    featureId: number | undefined;
    constructor(collider: Collider, timeOfImpact: number, normal: Vector, featureType?: FeatureType, featureId?: number);
    static fromRaw(colliderSet: ColliderSet, raw: RawRayColliderIntersection): RayColliderIntersection;
}
export declare class RayColliderHit {
    collider: Collider;
    timeOfImpact: number;
    constructor(collider: Collider, timeOfImpact: number);
    static fromRaw(colliderSet: ColliderSet, raw: RawRayColliderHit): RayColliderHit;
}
