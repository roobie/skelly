import { Vector } from "../math";
import { RawShapeContact } from "../raw";
export declare class ShapeContact {
    distance: number;
    point1: Vector;
    point2: Vector;
    normal1: Vector;
    normal2: Vector;
    constructor(dist: number, point1: Vector, point2: Vector, normal1: Vector, normal2: Vector);
    static fromBuffer(raw: RawShapeContact, target?: ShapeContact): ShapeContact;
}
