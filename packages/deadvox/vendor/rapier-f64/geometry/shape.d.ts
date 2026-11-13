import { Vector, Rotation } from "../math";
import { RawColliderSet, RawShape } from "../raw";
import { ShapeContact } from "./contact";
import { PointProjection } from "./point";
import { Ray, RayIntersection } from "./ray";
import { ShapeCastHit } from "./toi";
import { ColliderHandle } from "./collider";
export declare abstract class Shape {
    abstract intoRaw(): RawShape;
    abstract get type(): ShapeType;
    static fromRaw(rawSet: RawColliderSet, handle: ColliderHandle): Shape;
    static fromRawShape(rawShape: RawShape): Shape;
    castShape(shapePos1: Vector, shapeRot1: Rotation, shapeVel1: Vector, shape2: Shape, shapePos2: Vector, shapeRot2: Rotation, shapeVel2: Vector, targetDistance: number, maxToi: number, stopAtPenetration: boolean, target?: ShapeCastHit): ShapeCastHit | null;
    intersectsShape(shapePos1: Vector, shapeRot1: Rotation, shape2: Shape, shapePos2: Vector, shapeRot2: Rotation): boolean;
    contactShape(shapePos1: Vector, shapeRot1: Rotation, shape2: Shape, shapePos2: Vector, shapeRot2: Rotation, prediction: number, target?: ShapeContact): ShapeContact | null;
    containsPoint(shapePos: Vector, shapeRot: Rotation, point: Vector): boolean;
    projectPoint(shapePos: Vector, shapeRot: Rotation, point: Vector, solid: boolean, target?: PointProjection): PointProjection;
    intersectsRay(ray: Ray, shapePos: Vector, shapeRot: Rotation, maxToi: number): boolean;
    castRay(ray: Ray, shapePos: Vector, shapeRot: Rotation, maxToi: number, solid: boolean): number;
    castRayAndGetNormal(ray: Ray, shapePos: Vector, shapeRot: Rotation, maxToi: number, solid: boolean, target?: RayIntersection): RayIntersection;
}
export declare enum ShapeType {
    Ball = 0,
    Cuboid = 1,
    Capsule = 2,
    Segment = 3,
    Polyline = 4,
    Triangle = 5,
    TriMesh = 6,
    HeightField = 7,
    Compound = 8,
    ConvexPolyhedron = 9,
    Cylinder = 10,
    Cone = 11,
    RoundCuboid = 12,
    RoundTriangle = 13,
    RoundCylinder = 14,
    RoundCone = 15,
    RoundConvexPolyhedron = 16,
    HalfSpace = 17,
    Voxels = 18
}
export declare enum HeightFieldFlags {
    FIX_INTERNAL_EDGES = 1
}
export declare enum PolylineFlags {
    DEFORMABLE = 2
}
export declare enum CompoundFlags {
    FIX_INTERNAL_EDGES = 1
}
export declare enum TriMeshFlags {
    DELETE_BAD_TOPOLOGY_TRIANGLES = 4,
    ORIENTED = 8,
    MERGE_DUPLICATE_VERTICES = 16,
    DELETE_DEGENERATE_TRIANGLES = 32,
    DELETE_DUPLICATE_TRIANGLES = 64,
    FIX_INTERNAL_EDGES = 144,
    DEFORMABLE = 256,
    FIX_INTERNAL_EDGES_TWO_SIDED = 656
}
export declare class Ball extends Shape {
    readonly type = ShapeType.Ball;
    radius: number;
    constructor(radius: number);
    intoRaw(): RawShape;
}
export declare class HalfSpace extends Shape {
    readonly type = ShapeType.HalfSpace;
    normal: Vector;
    constructor(normal: Vector);
    intoRaw(): RawShape;
}
export declare class Cuboid extends Shape {
    readonly type = ShapeType.Cuboid;
    halfExtents: Vector;
    constructor(hx: number, hy: number, hz: number);
    intoRaw(): RawShape;
}
export declare class RoundCuboid extends Shape {
    readonly type = ShapeType.RoundCuboid;
    halfExtents: Vector;
    borderRadius: number;
    constructor(hx: number, hy: number, hz: number, borderRadius: number);
    intoRaw(): RawShape;
}
export declare class Capsule extends Shape {
    readonly type = ShapeType.Capsule;
    radius: number;
    halfHeight: number;
    constructor(halfHeight: number, radius: number);
    intoRaw(): RawShape;
}
export declare class Segment extends Shape {
    readonly type = ShapeType.Segment;
    a: Vector;
    b: Vector;
    constructor(a: Vector, b: Vector);
    intoRaw(): RawShape;
}
export declare class Triangle extends Shape {
    readonly type = ShapeType.Triangle;
    a: Vector;
    b: Vector;
    c: Vector;
    constructor(a: Vector, b: Vector, c: Vector);
    intoRaw(): RawShape;
}
export declare class RoundTriangle extends Shape {
    readonly type = ShapeType.RoundTriangle;
    a: Vector;
    b: Vector;
    c: Vector;
    borderRadius: number;
    constructor(a: Vector, b: Vector, c: Vector, borderRadius: number);
    intoRaw(): RawShape;
}
export declare class Polyline extends Shape {
    readonly type = ShapeType.Polyline;
    vertices: Float64Array;
    indices: Uint32Array;
    flags: PolylineFlags;
    constructor(vertices: Float64Array, indices?: Uint32Array, flags?: PolylineFlags);
    intoRaw(): RawShape;
}
export declare class Voxels extends Shape {
    readonly type = ShapeType.Voxels;
    data: Float64Array | Int32Array;
    voxelSize: Vector;
    constructor(data: Float64Array | Int32Array, voxelSize: Vector);
    intoRaw(): RawShape;
}
export declare class Compound extends Shape {
    readonly type = ShapeType.Compound;
    shapes: Shape[];
    positions: Vector[];
    rotations: Rotation[];
    flags: CompoundFlags;
    constructor(shapes: Shape[], positions: Vector[], rotations: Rotation[], flags?: CompoundFlags);
    static fromRawShape(rawShape: RawShape): Compound;
    intoRaw(): RawShape;
}
export declare class TriMesh extends Shape {
    readonly type = ShapeType.TriMesh;
    vertices: Float64Array;
    indices: Uint32Array;
    flags: TriMeshFlags;
    constructor(vertices: Float64Array, indices: Uint32Array, flags?: TriMeshFlags);
    intoRaw(): RawShape;
}
export declare class ConvexPolyhedron extends Shape {
    readonly type = ShapeType.ConvexPolyhedron;
    vertices: Float64Array;
    indices?: Uint32Array | null;
    constructor(vertices: Float64Array, indices?: Uint32Array | null);
    intoRaw(): RawShape;
}
export declare class RoundConvexPolyhedron extends Shape {
    readonly type = ShapeType.RoundConvexPolyhedron;
    vertices: Float64Array;
    indices?: Uint32Array;
    borderRadius: number;
    constructor(vertices: Float64Array, indices: Uint32Array | null | undefined, borderRadius: number);
    intoRaw(): RawShape;
}
export declare class Heightfield extends Shape {
    readonly type = ShapeType.HeightField;
    nrows: number;
    ncols: number;
    heights: Float64Array;
    scale: Vector;
    flags: HeightFieldFlags;
    constructor(nrows: number, ncols: number, heights: Float64Array, scale: Vector, flags?: HeightFieldFlags);
    intoRaw(): RawShape;
}
export declare class Cylinder extends Shape {
    readonly type = ShapeType.Cylinder;
    radius: number;
    halfHeight: number;
    constructor(halfHeight: number, radius: number);
    intoRaw(): RawShape;
}
export declare class RoundCylinder extends Shape {
    readonly type = ShapeType.RoundCylinder;
    radius: number;
    halfHeight: number;
    borderRadius: number;
    constructor(halfHeight: number, radius: number, borderRadius: number);
    intoRaw(): RawShape;
}
export declare class Cone extends Shape {
    readonly type = ShapeType.Cone;
    radius: number;
    halfHeight: number;
    constructor(halfHeight: number, radius: number);
    intoRaw(): RawShape;
}
export declare class RoundCone extends Shape {
    readonly type = ShapeType.RoundCone;
    radius: number;
    halfHeight: number;
    borderRadius: number;
    constructor(halfHeight: number, radius: number, borderRadius: number);
    intoRaw(): RawShape;
}
