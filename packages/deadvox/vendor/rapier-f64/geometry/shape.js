import { VectorOps, RotationOps } from "../math";
import { RawShape, RawShapeType } from "../raw";
import { ShapeContact } from "./contact";
import { PointProjection } from "./point";
import { RayIntersection } from "./ray";
import { ShapeCastHit } from "./toi";
export class Shape {
    static fromRaw(rawSet, handle) {
        const rawType = rawSet.coShapeType(handle);
        let extents;
        let borderRadius;
        let vs;
        let indices;
        let halfHeight;
        let radius;
        let normal;
        switch (rawType) {
            case RawShapeType.Ball:
                return new Ball(rawSet.coRadius(handle));
            case RawShapeType.Cuboid:
                extents = rawSet.coHalfExtents(handle);
                return new Cuboid(extents.x, extents.y, extents.z);
            case RawShapeType.RoundCuboid:
                extents = rawSet.coHalfExtents(handle);
                borderRadius = rawSet.coRoundRadius(handle);
                return new RoundCuboid(extents.x, extents.y, extents.z, borderRadius);
            case RawShapeType.Capsule:
                halfHeight = rawSet.coHalfHeight(handle);
                radius = rawSet.coRadius(handle);
                return new Capsule(halfHeight, radius);
            case RawShapeType.Segment:
                vs = rawSet.coVertices(handle);
                return new Segment(VectorOps.new(vs[0], vs[1], vs[2]), VectorOps.new(vs[3], vs[4], vs[5]));
            case RawShapeType.Polyline:
                vs = rawSet.coVertices(handle);
                indices = rawSet.coIndices(handle);
                return new Polyline(vs, indices);
            case RawShapeType.Triangle:
                vs = rawSet.coVertices(handle);
                return new Triangle(VectorOps.new(vs[0], vs[1], vs[2]), VectorOps.new(vs[3], vs[4], vs[5]), VectorOps.new(vs[6], vs[7], vs[8]));
            case RawShapeType.RoundTriangle:
                vs = rawSet.coVertices(handle);
                borderRadius = rawSet.coRoundRadius(handle);
                return new RoundTriangle(VectorOps.new(vs[0], vs[1], vs[2]), VectorOps.new(vs[3], vs[4], vs[5]), VectorOps.new(vs[6], vs[7], vs[8]), borderRadius);
            case RawShapeType.HalfSpace:
                normal = VectorOps.fromRaw(rawSet.coHalfspaceNormal(handle));
                return new HalfSpace(normal);
            case RawShapeType.Voxels:
                const vox_data = rawSet.coVoxelData(handle);
                const vox_size = rawSet.coVoxelSize(handle);
                return new Voxels(vox_data, vox_size);
            case RawShapeType.TriMesh:
                vs = rawSet.coVertices(handle);
                indices = rawSet.coIndices(handle);
                const tri_flags = rawSet.coTriMeshFlags(handle);
                return new TriMesh(vs, indices, tri_flags);
            case RawShapeType.HeightField:
                const scale = rawSet.coHeightfieldScale(handle);
                const heights = rawSet.coHeightfieldHeights(handle);
                const nrows = rawSet.coHeightfieldNRows(handle);
                const ncols = rawSet.coHeightfieldNCols(handle);
                const hf_flags = rawSet.coHeightFieldFlags(handle);
                return new Heightfield(nrows, ncols, heights, scale, hf_flags);
            case RawShapeType.ConvexPolyhedron:
                vs = rawSet.coVertices(handle);
                indices = rawSet.coIndices(handle);
                return new ConvexPolyhedron(vs, indices);
            case RawShapeType.RoundConvexPolyhedron:
                vs = rawSet.coVertices(handle);
                indices = rawSet.coIndices(handle);
                borderRadius = rawSet.coRoundRadius(handle);
                return new RoundConvexPolyhedron(vs, indices, borderRadius);
            case RawShapeType.Cylinder:
                halfHeight = rawSet.coHalfHeight(handle);
                radius = rawSet.coRadius(handle);
                return new Cylinder(halfHeight, radius);
            case RawShapeType.RoundCylinder:
                halfHeight = rawSet.coHalfHeight(handle);
                radius = rawSet.coRadius(handle);
                borderRadius = rawSet.coRoundRadius(handle);
                return new RoundCylinder(halfHeight, radius, borderRadius);
            case RawShapeType.Cone:
                halfHeight = rawSet.coHalfHeight(handle);
                radius = rawSet.coRadius(handle);
                return new Cone(halfHeight, radius);
            case RawShapeType.RoundCone:
                halfHeight = rawSet.coHalfHeight(handle);
                radius = rawSet.coRadius(handle);
                borderRadius = rawSet.coRoundRadius(handle);
                return new RoundCone(halfHeight, radius, borderRadius);
            default:
                throw new Error("unknown shape type: " + rawType);
        }
    }
    castShape(shapePos1, shapeRot1, shapeVel1, shape2, shapePos2, shapeRot2, shapeVel2, targetDistance, maxToi, stopAtPenetration) {
        let rawPos1 = VectorOps.intoRaw(shapePos1);
        let rawRot1 = RotationOps.intoRaw(shapeRot1);
        let rawVel1 = VectorOps.intoRaw(shapeVel1);
        let rawPos2 = VectorOps.intoRaw(shapePos2);
        let rawRot2 = RotationOps.intoRaw(shapeRot2);
        let rawVel2 = VectorOps.intoRaw(shapeVel2);
        let rawShape1 = this.intoRaw();
        let rawShape2 = shape2.intoRaw();
        let result = ShapeCastHit.fromRaw(null, rawShape1.castShape(rawPos1, rawRot1, rawVel1, rawShape2, rawPos2, rawRot2, rawVel2, targetDistance, maxToi, stopAtPenetration));
        rawPos1.free();
        rawRot1.free();
        rawVel1.free();
        rawPos2.free();
        rawRot2.free();
        rawVel2.free();
        rawShape1.free();
        rawShape2.free();
        return result;
    }
    intersectsShape(shapePos1, shapeRot1, shape2, shapePos2, shapeRot2) {
        let rawPos1 = VectorOps.intoRaw(shapePos1);
        let rawRot1 = RotationOps.intoRaw(shapeRot1);
        let rawPos2 = VectorOps.intoRaw(shapePos2);
        let rawRot2 = RotationOps.intoRaw(shapeRot2);
        let rawShape1 = this.intoRaw();
        let rawShape2 = shape2.intoRaw();
        let result = rawShape1.intersectsShape(rawPos1, rawRot1, rawShape2, rawPos2, rawRot2);
        rawPos1.free();
        rawRot1.free();
        rawPos2.free();
        rawRot2.free();
        rawShape1.free();
        rawShape2.free();
        return result;
    }
    contactShape(shapePos1, shapeRot1, shape2, shapePos2, shapeRot2, prediction) {
        let rawPos1 = VectorOps.intoRaw(shapePos1);
        let rawRot1 = RotationOps.intoRaw(shapeRot1);
        let rawPos2 = VectorOps.intoRaw(shapePos2);
        let rawRot2 = RotationOps.intoRaw(shapeRot2);
        let rawShape1 = this.intoRaw();
        let rawShape2 = shape2.intoRaw();
        let result = ShapeContact.fromRaw(rawShape1.contactShape(rawPos1, rawRot1, rawShape2, rawPos2, rawRot2, prediction));
        rawPos1.free();
        rawRot1.free();
        rawPos2.free();
        rawRot2.free();
        rawShape1.free();
        rawShape2.free();
        return result;
    }
    containsPoint(shapePos, shapeRot, point) {
        let rawPos = VectorOps.intoRaw(shapePos);
        let rawRot = RotationOps.intoRaw(shapeRot);
        let rawPoint = VectorOps.intoRaw(point);
        let rawShape = this.intoRaw();
        let result = rawShape.containsPoint(rawPos, rawRot, rawPoint);
        rawPos.free();
        rawRot.free();
        rawPoint.free();
        rawShape.free();
        return result;
    }
    projectPoint(shapePos, shapeRot, point, solid) {
        let rawPos = VectorOps.intoRaw(shapePos);
        let rawRot = RotationOps.intoRaw(shapeRot);
        let rawPoint = VectorOps.intoRaw(point);
        let rawShape = this.intoRaw();
        let result = PointProjection.fromRaw(rawShape.projectPoint(rawPos, rawRot, rawPoint, solid));
        rawPos.free();
        rawRot.free();
        rawPoint.free();
        rawShape.free();
        return result;
    }
    intersectsRay(ray, shapePos, shapeRot, maxToi) {
        let rawPos = VectorOps.intoRaw(shapePos);
        let rawRot = RotationOps.intoRaw(shapeRot);
        let rawRayOrig = VectorOps.intoRaw(ray.origin);
        let rawRayDir = VectorOps.intoRaw(ray.dir);
        let rawShape = this.intoRaw();
        let result = rawShape.intersectsRay(rawPos, rawRot, rawRayOrig, rawRayDir, maxToi);
        rawPos.free();
        rawRot.free();
        rawRayOrig.free();
        rawRayDir.free();
        rawShape.free();
        return result;
    }
    castRay(ray, shapePos, shapeRot, maxToi, solid) {
        let rawPos = VectorOps.intoRaw(shapePos);
        let rawRot = RotationOps.intoRaw(shapeRot);
        let rawRayOrig = VectorOps.intoRaw(ray.origin);
        let rawRayDir = VectorOps.intoRaw(ray.dir);
        let rawShape = this.intoRaw();
        let result = rawShape.castRay(rawPos, rawRot, rawRayOrig, rawRayDir, maxToi, solid);
        rawPos.free();
        rawRot.free();
        rawRayOrig.free();
        rawRayDir.free();
        rawShape.free();
        return result;
    }
    castRayAndGetNormal(ray, shapePos, shapeRot, maxToi, solid) {
        let rawPos = VectorOps.intoRaw(shapePos);
        let rawRot = RotationOps.intoRaw(shapeRot);
        let rawRayOrig = VectorOps.intoRaw(ray.origin);
        let rawRayDir = VectorOps.intoRaw(ray.dir);
        let rawShape = this.intoRaw();
        let result = RayIntersection.fromRaw(rawShape.castRayAndGetNormal(rawPos, rawRot, rawRayOrig, rawRayDir, maxToi, solid));
        rawPos.free();
        rawRot.free();
        rawRayOrig.free();
        rawRayDir.free();
        rawShape.free();
        return result;
    }
}
export var ShapeType;
(function (ShapeType) {
    ShapeType[ShapeType["Ball"] = 0] = "Ball";
    ShapeType[ShapeType["Cuboid"] = 1] = "Cuboid";
    ShapeType[ShapeType["Capsule"] = 2] = "Capsule";
    ShapeType[ShapeType["Segment"] = 3] = "Segment";
    ShapeType[ShapeType["Polyline"] = 4] = "Polyline";
    ShapeType[ShapeType["Triangle"] = 5] = "Triangle";
    ShapeType[ShapeType["TriMesh"] = 6] = "TriMesh";
    ShapeType[ShapeType["HeightField"] = 7] = "HeightField";
    ShapeType[ShapeType["ConvexPolyhedron"] = 9] = "ConvexPolyhedron";
    ShapeType[ShapeType["Cylinder"] = 10] = "Cylinder";
    ShapeType[ShapeType["Cone"] = 11] = "Cone";
    ShapeType[ShapeType["RoundCuboid"] = 12] = "RoundCuboid";
    ShapeType[ShapeType["RoundTriangle"] = 13] = "RoundTriangle";
    ShapeType[ShapeType["RoundCylinder"] = 14] = "RoundCylinder";
    ShapeType[ShapeType["RoundCone"] = 15] = "RoundCone";
    ShapeType[ShapeType["RoundConvexPolyhedron"] = 16] = "RoundConvexPolyhedron";
    ShapeType[ShapeType["HalfSpace"] = 17] = "HalfSpace";
    ShapeType[ShapeType["Voxels"] = 18] = "Voxels";
})(ShapeType || (ShapeType = {}));
export var HeightFieldFlags;
(function (HeightFieldFlags) {
    HeightFieldFlags[HeightFieldFlags["FIX_INTERNAL_EDGES"] = 1] = "FIX_INTERNAL_EDGES";
})(HeightFieldFlags || (HeightFieldFlags = {}));
export var TriMeshFlags;
(function (TriMeshFlags) {
    TriMeshFlags[TriMeshFlags["DELETE_BAD_TOPOLOGY_TRIANGLES"] = 4] = "DELETE_BAD_TOPOLOGY_TRIANGLES";
    TriMeshFlags[TriMeshFlags["ORIENTED"] = 8] = "ORIENTED";
    TriMeshFlags[TriMeshFlags["MERGE_DUPLICATE_VERTICES"] = 16] = "MERGE_DUPLICATE_VERTICES";
    TriMeshFlags[TriMeshFlags["DELETE_DEGENERATE_TRIANGLES"] = 32] = "DELETE_DEGENERATE_TRIANGLES";
    TriMeshFlags[TriMeshFlags["DELETE_DUPLICATE_TRIANGLES"] = 64] = "DELETE_DUPLICATE_TRIANGLES";
    TriMeshFlags[TriMeshFlags["FIX_INTERNAL_EDGES"] = 144] = "FIX_INTERNAL_EDGES";
})(TriMeshFlags || (TriMeshFlags = {}));
export class Ball extends Shape {
    constructor(radius) {
        super();
        this.type = ShapeType.Ball;
        this.radius = radius;
    }
    intoRaw() {
        return RawShape.ball(this.radius);
    }
}
export class HalfSpace extends Shape {
    constructor(normal) {
        super();
        this.type = ShapeType.HalfSpace;
        this.normal = normal;
    }
    intoRaw() {
        let n = VectorOps.intoRaw(this.normal);
        let result = RawShape.halfspace(n);
        n.free();
        return result;
    }
}
export class Cuboid extends Shape {
    constructor(hx, hy, hz) {
        super();
        this.type = ShapeType.Cuboid;
        this.halfExtents = VectorOps.new(hx, hy, hz);
    }
    intoRaw() {
        return RawShape.cuboid(this.halfExtents.x, this.halfExtents.y, this.halfExtents.z);
    }
}
export class RoundCuboid extends Shape {
    constructor(hx, hy, hz, borderRadius) {
        super();
        this.type = ShapeType.RoundCuboid;
        this.halfExtents = VectorOps.new(hx, hy, hz);
        this.borderRadius = borderRadius;
    }
    intoRaw() {
        return RawShape.roundCuboid(this.halfExtents.x, this.halfExtents.y, this.halfExtents.z, this.borderRadius);
    }
}
export class Capsule extends Shape {
    constructor(halfHeight, radius) {
        super();
        this.type = ShapeType.Capsule;
        this.halfHeight = halfHeight;
        this.radius = radius;
    }
    intoRaw() {
        return RawShape.capsule(this.halfHeight, this.radius);
    }
}
export class Segment extends Shape {
    constructor(a, b) {
        super();
        this.type = ShapeType.Segment;
        this.a = a;
        this.b = b;
    }
    intoRaw() {
        let ra = VectorOps.intoRaw(this.a);
        let rb = VectorOps.intoRaw(this.b);
        let result = RawShape.segment(ra, rb);
        ra.free();
        rb.free();
        return result;
    }
}
export class Triangle extends Shape {
    constructor(a, b, c) {
        super();
        this.type = ShapeType.Triangle;
        this.a = a;
        this.b = b;
        this.c = c;
    }
    intoRaw() {
        let ra = VectorOps.intoRaw(this.a);
        let rb = VectorOps.intoRaw(this.b);
        let rc = VectorOps.intoRaw(this.c);
        let result = RawShape.triangle(ra, rb, rc);
        ra.free();
        rb.free();
        rc.free();
        return result;
    }
}
export class RoundTriangle extends Shape {
    constructor(a, b, c, borderRadius) {
        super();
        this.type = ShapeType.RoundTriangle;
        this.a = a;
        this.b = b;
        this.c = c;
        this.borderRadius = borderRadius;
    }
    intoRaw() {
        let ra = VectorOps.intoRaw(this.a);
        let rb = VectorOps.intoRaw(this.b);
        let rc = VectorOps.intoRaw(this.c);
        let result = RawShape.roundTriangle(ra, rb, rc, this.borderRadius);
        ra.free();
        rb.free();
        rc.free();
        return result;
    }
}
export class Polyline extends Shape {
    constructor(vertices, indices) {
        super();
        this.type = ShapeType.Polyline;
        this.vertices = vertices;
        this.indices = indices ?? new Uint32Array(0);
    }
    intoRaw() {
        return RawShape.polyline(this.vertices, this.indices);
    }
}
export class Voxels extends Shape {
    constructor(data, voxelSize) {
        super();
        this.type = ShapeType.Voxels;
        this.data = data;
        this.voxelSize = voxelSize;
    }
    intoRaw() {
        let voxelSize = VectorOps.intoRaw(this.voxelSize);
        let result;
        if (this.data instanceof Int32Array) {
            result = RawShape.voxels(voxelSize, this.data);
        }
        else {
            result = RawShape.voxelsFromPoints(voxelSize, this.data);
        }
        voxelSize.free();
        return result;
    }
}
export class TriMesh extends Shape {
    constructor(vertices, indices, flags) {
        super();
        this.type = ShapeType.TriMesh;
        this.vertices = vertices;
        this.indices = indices;
        this.flags = flags;
    }
    intoRaw() {
        return RawShape.trimesh(this.vertices, this.indices, this.flags);
    }
}
export class ConvexPolyhedron extends Shape {
    constructor(vertices, indices) {
        super();
        this.type = ShapeType.ConvexPolyhedron;
        this.vertices = vertices;
        this.indices = indices;
    }
    intoRaw() {
        if (!!this.indices) {
            return RawShape.convexMesh(this.vertices, this.indices);
        }
        else {
            return RawShape.convexHull(this.vertices);
        }
    }
}
export class RoundConvexPolyhedron extends Shape {
    constructor(vertices, indices, borderRadius) {
        super();
        this.type = ShapeType.RoundConvexPolyhedron;
        this.vertices = vertices;
        this.indices = indices;
        this.borderRadius = borderRadius;
    }
    intoRaw() {
        if (!!this.indices) {
            return RawShape.roundConvexMesh(this.vertices, this.indices, this.borderRadius);
        }
        else {
            return RawShape.roundConvexHull(this.vertices, this.borderRadius);
        }
    }
}
export class Heightfield extends Shape {
    constructor(nrows, ncols, heights, scale, flags) {
        super();
        this.type = ShapeType.HeightField;
        this.nrows = nrows;
        this.ncols = ncols;
        this.heights = heights;
        this.scale = scale;
        this.flags = flags;
    }
    intoRaw() {
        let rawScale = VectorOps.intoRaw(this.scale);
        let rawShape = RawShape.heightfield(this.nrows, this.ncols, this.heights, rawScale, this.flags);
        rawScale.free();
        return rawShape;
    }
}
export class Cylinder extends Shape {
    constructor(halfHeight, radius) {
        super();
        this.type = ShapeType.Cylinder;
        this.halfHeight = halfHeight;
        this.radius = radius;
    }
    intoRaw() {
        return RawShape.cylinder(this.halfHeight, this.radius);
    }
}
export class RoundCylinder extends Shape {
    constructor(halfHeight, radius, borderRadius) {
        super();
        this.type = ShapeType.RoundCylinder;
        this.borderRadius = borderRadius;
        this.halfHeight = halfHeight;
        this.radius = radius;
    }
    intoRaw() {
        return RawShape.roundCylinder(this.halfHeight, this.radius, this.borderRadius);
    }
}
export class Cone extends Shape {
    constructor(halfHeight, radius) {
        super();
        this.type = ShapeType.Cone;
        this.halfHeight = halfHeight;
        this.radius = radius;
    }
    intoRaw() {
        return RawShape.cone(this.halfHeight, this.radius);
    }
}
export class RoundCone extends Shape {
    constructor(halfHeight, radius, borderRadius) {
        super();
        this.type = ShapeType.RoundCone;
        this.halfHeight = halfHeight;
        this.radius = radius;
        this.borderRadius = borderRadius;
    }
    intoRaw() {
        return RawShape.roundCone(this.halfHeight, this.radius, this.borderRadius);
    }
}
