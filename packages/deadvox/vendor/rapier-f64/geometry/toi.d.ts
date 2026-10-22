import { Collider } from "./collider";
import { Vector } from "../math";
import { RawShapeCastHit, RawColliderShapeCastHit } from "../raw";
import { ColliderSet } from "./collider_set";
export declare class ShapeCastHit {
    time_of_impact: number;
    witness1: Vector;
    witness2: Vector;
    normal1: Vector;
    normal2: Vector;
    constructor(time_of_impact: number, witness1: Vector, witness2: Vector, normal1: Vector, normal2: Vector);
    static fromRaw(colliderSet: ColliderSet, raw: RawShapeCastHit): ShapeCastHit;
}
export declare class ColliderShapeCastHit extends ShapeCastHit {
    collider: Collider;
    constructor(collider: Collider, time_of_impact: number, witness1: Vector, witness2: Vector, normal1: Vector, normal2: Vector);
    static fromRaw(colliderSet: ColliderSet, raw: RawColliderShapeCastHit): ColliderShapeCastHit;
}
