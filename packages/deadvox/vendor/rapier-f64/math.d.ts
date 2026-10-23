import { RawVector, RawRotation } from "./raw";
import { RawSdpMatrix3 } from "./raw";
export interface Vector {
    x: number;
    y: number;
    z: number;
}
export declare class Vector3 implements Vector {
    x: number;
    y: number;
    z: number;
    constructor(x: number, y: number, z: number);
}
export declare class VectorOps {
    static new(x: number, y: number, z: number): Vector;
    static intoRaw(v: Vector): RawVector;
    static zeros(): Vector;
    static fromRaw(raw: RawVector): Vector;
    static copy(out: Vector, input: Vector): void;
}
export interface Rotation {
    x: number;
    y: number;
    z: number;
    w: number;
}
export declare class Quaternion implements Rotation {
    x: number;
    y: number;
    z: number;
    w: number;
    constructor(x: number, y: number, z: number, w: number);
}
export declare class RotationOps {
    static identity(): Rotation;
    static fromRaw(raw: RawRotation): Rotation;
    static intoRaw(rot: Rotation): RawRotation;
    static copy(out: Rotation, input: Rotation): void;
}
export declare class SdpMatrix3 {
    elements: Float64Array;
    get m11(): number;
    get m12(): number;
    get m21(): number;
    get m13(): number;
    get m31(): number;
    get m22(): number;
    get m23(): number;
    get m32(): number;
    get m33(): number;
    constructor(elements: Float64Array);
}
export declare class SdpMatrix3Ops {
    static fromRaw(raw: RawSdpMatrix3): SdpMatrix3;
}
