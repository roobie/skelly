import { Collider } from "./collider";
import { Vector } from "../math";
export declare class ShapeCastHit {
    time_of_impact: number;
    witness1: Vector;
    witness2: Vector;
    normal1: Vector;
    normal2: Vector;
    constructor(time_of_impact: number, witness1: Vector, witness2: Vector, normal1: Vector, normal2: Vector);
    static fromBuffer(collider: Collider, buffer: Float64Array, target?: ShapeCastHit): ShapeCastHit;
}
export declare class ColliderShapeCastHit extends ShapeCastHit {
    collider: Collider;
    constructor(collider: Collider, time_of_impact: number, witness1: Vector, witness2: Vector, normal1: Vector, normal2: Vector);
    static fromBuffer(collider: Collider, buffer: Float64Array, target?: ColliderShapeCastHit): ColliderShapeCastHit;
}
