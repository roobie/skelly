import { RotationOps, VectorOps } from "../math";
import { CoefficientCombineRule, } from "../dynamics";
import { ActiveHooks, ActiveEvents } from "../pipeline";
import { Shape, Cuboid, Ball, Capsule, Voxels, TriMesh, Polyline, Heightfield, Segment, Triangle, RoundTriangle, RoundCuboid, Cylinder, RoundCylinder, Cone, RoundCone, ConvexPolyhedron, RoundConvexPolyhedron, } from "./shape";
import { RayIntersection } from "./ray";
import { PointProjection } from "./point";
import { ColliderShapeCastHit, ShapeCastHit } from "./toi";
import { ShapeContact } from "./contact";
export var ActiveCollisionTypes;
(function (ActiveCollisionTypes) {
    ActiveCollisionTypes[ActiveCollisionTypes["DYNAMIC_DYNAMIC"] = 1] = "DYNAMIC_DYNAMIC";
    ActiveCollisionTypes[ActiveCollisionTypes["DYNAMIC_KINEMATIC"] = 12] = "DYNAMIC_KINEMATIC";
    ActiveCollisionTypes[ActiveCollisionTypes["DYNAMIC_FIXED"] = 2] = "DYNAMIC_FIXED";
    ActiveCollisionTypes[ActiveCollisionTypes["KINEMATIC_KINEMATIC"] = 52224] = "KINEMATIC_KINEMATIC";
    ActiveCollisionTypes[ActiveCollisionTypes["KINEMATIC_FIXED"] = 8704] = "KINEMATIC_FIXED";
    ActiveCollisionTypes[ActiveCollisionTypes["FIXED_FIXED"] = 32] = "FIXED_FIXED";
    ActiveCollisionTypes[ActiveCollisionTypes["DEFAULT"] = 15] = "DEFAULT";
    ActiveCollisionTypes[ActiveCollisionTypes["ALL"] = 60943] = "ALL";
})(ActiveCollisionTypes || (ActiveCollisionTypes = {}));
export class Collider {
    constructor(colliderSet, handle, parent, shape) {
        this.colliderSet = colliderSet;
        this.handle = handle;
        this._parent = parent;
        this._shape = shape;
    }
    finalizeDeserialization(bodies) {
        if (this.handle != null) {
            this._parent = bodies.get(this.colliderSet.raw.coParent(this.handle));
        }
    }
    ensureShapeIsCached() {
        if (!this._shape)
            this._shape = Shape.fromRaw(this.colliderSet.raw, this.handle);
    }
    get shape() {
        this.ensureShapeIsCached();
        return this._shape;
    }
    clearShapeCache() {
        this._shape = null;
    }
    isValid() {
        return this.colliderSet.raw.contains(this.handle);
    }
    translation() {
        return VectorOps.fromRaw(this.colliderSet.raw.coTranslation(this.handle));
    }
    translationWrtParent() {
        return VectorOps.fromRaw(this.colliderSet.raw.coTranslationWrtParent(this.handle));
    }
    rotation() {
        return RotationOps.fromRaw(this.colliderSet.raw.coRotation(this.handle));
    }
    rotationWrtParent() {
        return RotationOps.fromRaw(this.colliderSet.raw.coRotationWrtParent(this.handle));
    }
    isSensor() {
        return this.colliderSet.raw.coIsSensor(this.handle);
    }
    setSensor(isSensor) {
        this.colliderSet.raw.coSetSensor(this.handle, isSensor);
    }
    setShape(shape) {
        let rawShape = shape.intoRaw();
        this.colliderSet.raw.coSetShape(this.handle, rawShape);
        rawShape.free();
        this._shape = shape;
    }
    setEnabled(enabled) {
        this.colliderSet.raw.coSetEnabled(this.handle, enabled);
    }
    isEnabled() {
        return this.colliderSet.raw.coIsEnabled(this.handle);
    }
    setRestitution(restitution) {
        this.colliderSet.raw.coSetRestitution(this.handle, restitution);
    }
    setFriction(friction) {
        this.colliderSet.raw.coSetFriction(this.handle, friction);
    }
    frictionCombineRule() {
        return this.colliderSet.raw.coFrictionCombineRule(this.handle);
    }
    setFrictionCombineRule(rule) {
        this.colliderSet.raw.coSetFrictionCombineRule(this.handle, rule);
    }
    restitutionCombineRule() {
        return this.colliderSet.raw.coRestitutionCombineRule(this.handle);
    }
    setRestitutionCombineRule(rule) {
        this.colliderSet.raw.coSetRestitutionCombineRule(this.handle, rule);
    }
    setCollisionGroups(groups) {
        this.colliderSet.raw.coSetCollisionGroups(this.handle, groups);
    }
    setSolverGroups(groups) {
        this.colliderSet.raw.coSetSolverGroups(this.handle, groups);
    }
    contactSkin() {
        return this.colliderSet.raw.coContactSkin(this.handle);
    }
    setContactSkin(thickness) {
        return this.colliderSet.raw.coSetContactSkin(this.handle, thickness);
    }
    activeHooks() {
        return this.colliderSet.raw.coActiveHooks(this.handle);
    }
    setActiveHooks(activeHooks) {
        this.colliderSet.raw.coSetActiveHooks(this.handle, activeHooks);
    }
    activeEvents() {
        return this.colliderSet.raw.coActiveEvents(this.handle);
    }
    setActiveEvents(activeEvents) {
        this.colliderSet.raw.coSetActiveEvents(this.handle, activeEvents);
    }
    activeCollisionTypes() {
        return this.colliderSet.raw.coActiveCollisionTypes(this.handle);
    }
    setContactForceEventThreshold(threshold) {
        return this.colliderSet.raw.coSetContactForceEventThreshold(this.handle, threshold);
    }
    contactForceEventThreshold() {
        return this.colliderSet.raw.coContactForceEventThreshold(this.handle);
    }
    setActiveCollisionTypes(activeCollisionTypes) {
        this.colliderSet.raw.coSetActiveCollisionTypes(this.handle, activeCollisionTypes);
    }
    setDensity(density) {
        this.colliderSet.raw.coSetDensity(this.handle, density);
    }
    setMass(mass) {
        this.colliderSet.raw.coSetMass(this.handle, mass);
    }
    setMassProperties(mass, centerOfMass, principalAngularInertia, angularInertiaLocalFrame) {
        let rawCom = VectorOps.intoRaw(centerOfMass);
        let rawPrincipalInertia = VectorOps.intoRaw(principalAngularInertia);
        let rawInertiaFrame = RotationOps.intoRaw(angularInertiaLocalFrame);
        this.colliderSet.raw.coSetMassProperties(this.handle, mass, rawCom, rawPrincipalInertia, rawInertiaFrame);
        rawCom.free();
        rawPrincipalInertia.free();
        rawInertiaFrame.free();
    }
    setTranslation(tra) {
        this.colliderSet.raw.coSetTranslation(this.handle, tra.x, tra.y, tra.z);
    }
    setTranslationWrtParent(tra) {
        this.colliderSet.raw.coSetTranslationWrtParent(this.handle, tra.x, tra.y, tra.z);
    }
    setRotation(rot) {
        this.colliderSet.raw.coSetRotation(this.handle, rot.x, rot.y, rot.z, rot.w);
    }
    setRotationWrtParent(rot) {
        this.colliderSet.raw.coSetRotationWrtParent(this.handle, rot.x, rot.y, rot.z, rot.w);
    }
    shapeType() {
        return this.colliderSet.raw.coShapeType(this.handle);
    }
    halfExtents() {
        return VectorOps.fromRaw(this.colliderSet.raw.coHalfExtents(this.handle));
    }
    setHalfExtents(newHalfExtents) {
        const rawPoint = VectorOps.intoRaw(newHalfExtents);
        this.colliderSet.raw.coSetHalfExtents(this.handle, rawPoint);
    }
    radius() {
        return this.colliderSet.raw.coRadius(this.handle);
    }
    setRadius(newRadius) {
        this.colliderSet.raw.coSetRadius(this.handle, newRadius);
    }
    roundRadius() {
        return this.colliderSet.raw.coRoundRadius(this.handle);
    }
    setRoundRadius(newBorderRadius) {
        this.colliderSet.raw.coSetRoundRadius(this.handle, newBorderRadius);
    }
    halfHeight() {
        return this.colliderSet.raw.coHalfHeight(this.handle);
    }
    setHalfHeight(newHalfheight) {
        this.colliderSet.raw.coSetHalfHeight(this.handle, newHalfheight);
    }
    setVoxel(ix, iy, iz, filled) {
        this.colliderSet.raw.coSetVoxel(this.handle, ix, iy, iz, filled);
        this._shape = null;
    }
    propagateVoxelChange(voxels2, ix, iy, iz, shift_x, shift_y, shift_z) {
        this.colliderSet.raw.coPropagateVoxelChange(this.handle, voxels2.handle, ix, iy, iz, shift_x, shift_y, shift_z);
        this._shape = null;
    }
    combineVoxelStates(voxels2, shift_x, shift_y, shift_z) {
        this.colliderSet.raw.coCombineVoxelStates(this.handle, voxels2.handle, shift_x, shift_y, shift_z);
        this._shape = null;
    }
    vertices() {
        return this.colliderSet.raw.coVertices(this.handle);
    }
    indices() {
        return this.colliderSet.raw.coIndices(this.handle);
    }
    heightfieldHeights() {
        return this.colliderSet.raw.coHeightfieldHeights(this.handle);
    }
    heightfieldScale() {
        let scale = this.colliderSet.raw.coHeightfieldScale(this.handle);
        return VectorOps.fromRaw(scale);
    }
    heightfieldNRows() {
        return this.colliderSet.raw.coHeightfieldNRows(this.handle);
    }
    heightfieldNCols() {
        return this.colliderSet.raw.coHeightfieldNCols(this.handle);
    }
    parent() {
        return this._parent;
    }
    friction() {
        return this.colliderSet.raw.coFriction(this.handle);
    }
    restitution() {
        return this.colliderSet.raw.coRestitution(this.handle);
    }
    density() {
        return this.colliderSet.raw.coDensity(this.handle);
    }
    mass() {
        return this.colliderSet.raw.coMass(this.handle);
    }
    volume() {
        return this.colliderSet.raw.coVolume(this.handle);
    }
    collisionGroups() {
        return this.colliderSet.raw.coCollisionGroups(this.handle);
    }
    solverGroups() {
        return this.colliderSet.raw.coSolverGroups(this.handle);
    }
    containsPoint(point) {
        let rawPoint = VectorOps.intoRaw(point);
        let result = this.colliderSet.raw.coContainsPoint(this.handle, rawPoint);
        rawPoint.free();
        return result;
    }
    projectPoint(point, solid) {
        let rawPoint = VectorOps.intoRaw(point);
        let result = PointProjection.fromRaw(this.colliderSet.raw.coProjectPoint(this.handle, rawPoint, solid));
        rawPoint.free();
        return result;
    }
    intersectsRay(ray, maxToi) {
        let rawOrig = VectorOps.intoRaw(ray.origin);
        let rawDir = VectorOps.intoRaw(ray.dir);
        let result = this.colliderSet.raw.coIntersectsRay(this.handle, rawOrig, rawDir, maxToi);
        rawOrig.free();
        rawDir.free();
        return result;
    }
    castShape(collider1Vel, shape2, shape2Pos, shape2Rot, shape2Vel, targetDistance, maxToi, stopAtPenetration) {
        let rawCollider1Vel = VectorOps.intoRaw(collider1Vel);
        let rawShape2Pos = VectorOps.intoRaw(shape2Pos);
        let rawShape2Rot = RotationOps.intoRaw(shape2Rot);
        let rawShape2Vel = VectorOps.intoRaw(shape2Vel);
        let rawShape2 = shape2.intoRaw();
        let result = ShapeCastHit.fromRaw(this.colliderSet, this.colliderSet.raw.coCastShape(this.handle, rawCollider1Vel, rawShape2, rawShape2Pos, rawShape2Rot, rawShape2Vel, targetDistance, maxToi, stopAtPenetration));
        rawCollider1Vel.free();
        rawShape2Pos.free();
        rawShape2Rot.free();
        rawShape2Vel.free();
        rawShape2.free();
        return result;
    }
    castCollider(collider1Vel, collider2, collider2Vel, targetDistance, maxToi, stopAtPenetration) {
        let rawCollider1Vel = VectorOps.intoRaw(collider1Vel);
        let rawCollider2Vel = VectorOps.intoRaw(collider2Vel);
        let result = ColliderShapeCastHit.fromRaw(this.colliderSet, this.colliderSet.raw.coCastCollider(this.handle, rawCollider1Vel, collider2.handle, rawCollider2Vel, targetDistance, maxToi, stopAtPenetration));
        rawCollider1Vel.free();
        rawCollider2Vel.free();
        return result;
    }
    intersectsShape(shape2, shapePos2, shapeRot2) {
        let rawPos2 = VectorOps.intoRaw(shapePos2);
        let rawRot2 = RotationOps.intoRaw(shapeRot2);
        let rawShape2 = shape2.intoRaw();
        let result = this.colliderSet.raw.coIntersectsShape(this.handle, rawShape2, rawPos2, rawRot2);
        rawPos2.free();
        rawRot2.free();
        rawShape2.free();
        return result;
    }
    contactShape(shape2, shape2Pos, shape2Rot, prediction) {
        let rawPos2 = VectorOps.intoRaw(shape2Pos);
        let rawRot2 = RotationOps.intoRaw(shape2Rot);
        let rawShape2 = shape2.intoRaw();
        let result = ShapeContact.fromRaw(this.colliderSet.raw.coContactShape(this.handle, rawShape2, rawPos2, rawRot2, prediction));
        rawPos2.free();
        rawRot2.free();
        rawShape2.free();
        return result;
    }
    contactCollider(collider2, prediction) {
        let result = ShapeContact.fromRaw(this.colliderSet.raw.coContactCollider(this.handle, collider2.handle, prediction));
        return result;
    }
    castRay(ray, maxToi, solid) {
        let rawOrig = VectorOps.intoRaw(ray.origin);
        let rawDir = VectorOps.intoRaw(ray.dir);
        let result = this.colliderSet.raw.coCastRay(this.handle, rawOrig, rawDir, maxToi, solid);
        rawOrig.free();
        rawDir.free();
        return result;
    }
    castRayAndGetNormal(ray, maxToi, solid) {
        let rawOrig = VectorOps.intoRaw(ray.origin);
        let rawDir = VectorOps.intoRaw(ray.dir);
        let result = RayIntersection.fromRaw(this.colliderSet.raw.coCastRayAndGetNormal(this.handle, rawOrig, rawDir, maxToi, solid));
        rawOrig.free();
        rawDir.free();
        return result;
    }
}
export var MassPropsMode;
(function (MassPropsMode) {
    MassPropsMode[MassPropsMode["Density"] = 0] = "Density";
    MassPropsMode[MassPropsMode["Mass"] = 1] = "Mass";
    MassPropsMode[MassPropsMode["MassProps"] = 2] = "MassProps";
})(MassPropsMode || (MassPropsMode = {}));
export class ColliderDesc {
    constructor(shape) {
        this.enabled = true;
        this.shape = shape;
        this.massPropsMode = MassPropsMode.Density;
        this.density = 1.0;
        this.friction = 0.5;
        this.restitution = 0.0;
        this.rotation = RotationOps.identity();
        this.translation = VectorOps.zeros();
        this.isSensor = false;
        this.collisionGroups = 4294967295;
        this.solverGroups = 4294967295;
        this.frictionCombineRule = CoefficientCombineRule.Average;
        this.restitutionCombineRule = CoefficientCombineRule.Average;
        this.activeCollisionTypes = ActiveCollisionTypes.DEFAULT;
        this.activeEvents = ActiveEvents.NONE;
        this.activeHooks = ActiveHooks.NONE;
        this.mass = 0.0;
        this.centerOfMass = VectorOps.zeros();
        this.contactForceEventThreshold = 0.0;
        this.contactSkin = 0.0;
        this.principalAngularInertia = VectorOps.zeros();
        this.angularInertiaLocalFrame = RotationOps.identity();
    }
    static ball(radius) {
        const shape = new Ball(radius);
        return new ColliderDesc(shape);
    }
    static capsule(halfHeight, radius) {
        const shape = new Capsule(halfHeight, radius);
        return new ColliderDesc(shape);
    }
    static segment(a, b) {
        const shape = new Segment(a, b);
        return new ColliderDesc(shape);
    }
    static triangle(a, b, c) {
        const shape = new Triangle(a, b, c);
        return new ColliderDesc(shape);
    }
    static roundTriangle(a, b, c, borderRadius) {
        const shape = new RoundTriangle(a, b, c, borderRadius);
        return new ColliderDesc(shape);
    }
    static polyline(vertices, indices) {
        const shape = new Polyline(vertices, indices);
        return new ColliderDesc(shape);
    }
    static voxels(voxels, voxelSize) {
        const shape = new Voxels(voxels, voxelSize);
        return new ColliderDesc(shape);
    }
    static trimesh(vertices, indices, flags) {
        const shape = new TriMesh(vertices, indices, flags);
        return new ColliderDesc(shape);
    }
    static cuboid(hx, hy, hz) {
        const shape = new Cuboid(hx, hy, hz);
        return new ColliderDesc(shape);
    }
    static roundCuboid(hx, hy, hz, borderRadius) {
        const shape = new RoundCuboid(hx, hy, hz, borderRadius);
        return new ColliderDesc(shape);
    }
    static heightfield(nrows, ncols, heights, scale, flags) {
        const shape = new Heightfield(nrows, ncols, heights, scale, flags);
        return new ColliderDesc(shape);
    }
    static cylinder(halfHeight, radius) {
        const shape = new Cylinder(halfHeight, radius);
        return new ColliderDesc(shape);
    }
    static roundCylinder(halfHeight, radius, borderRadius) {
        const shape = new RoundCylinder(halfHeight, radius, borderRadius);
        return new ColliderDesc(shape);
    }
    static cone(halfHeight, radius) {
        const shape = new Cone(halfHeight, radius);
        return new ColliderDesc(shape);
    }
    static roundCone(halfHeight, radius, borderRadius) {
        const shape = new RoundCone(halfHeight, radius, borderRadius);
        return new ColliderDesc(shape);
    }
    static convexHull(points) {
        const shape = new ConvexPolyhedron(points, null);
        return new ColliderDesc(shape);
    }
    static convexMesh(vertices, indices) {
        const shape = new ConvexPolyhedron(vertices, indices);
        return new ColliderDesc(shape);
    }
    static roundConvexHull(points, borderRadius) {
        const shape = new RoundConvexPolyhedron(points, null, borderRadius);
        return new ColliderDesc(shape);
    }
    static roundConvexMesh(vertices, indices, borderRadius) {
        const shape = new RoundConvexPolyhedron(vertices, indices, borderRadius);
        return new ColliderDesc(shape);
    }
    setTranslation(x, y, z) {
        if (typeof x != "number" ||
            typeof y != "number" ||
            typeof z != "number")
            throw TypeError("The translation components must be numbers.");
        this.translation = { x: x, y: y, z: z };
        return this;
    }
    setRotation(rot) {
        RotationOps.copy(this.rotation, rot);
        return this;
    }
    setSensor(sensor) {
        this.isSensor = sensor;
        return this;
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        return this;
    }
    setContactSkin(thickness) {
        this.contactSkin = thickness;
        return this;
    }
    setDensity(density) {
        this.massPropsMode = MassPropsMode.Density;
        this.density = density;
        return this;
    }
    setMass(mass) {
        this.massPropsMode = MassPropsMode.Mass;
        this.mass = mass;
        return this;
    }
    setMassProperties(mass, centerOfMass, principalAngularInertia, angularInertiaLocalFrame) {
        this.massPropsMode = MassPropsMode.MassProps;
        this.mass = mass;
        VectorOps.copy(this.centerOfMass, centerOfMass);
        VectorOps.copy(this.principalAngularInertia, principalAngularInertia);
        RotationOps.copy(this.angularInertiaLocalFrame, angularInertiaLocalFrame);
        return this;
    }
    setRestitution(restitution) {
        this.restitution = restitution;
        return this;
    }
    setFriction(friction) {
        this.friction = friction;
        return this;
    }
    setFrictionCombineRule(rule) {
        this.frictionCombineRule = rule;
        return this;
    }
    setRestitutionCombineRule(rule) {
        this.restitutionCombineRule = rule;
        return this;
    }
    setCollisionGroups(groups) {
        this.collisionGroups = groups;
        return this;
    }
    setSolverGroups(groups) {
        this.solverGroups = groups;
        return this;
    }
    setActiveHooks(activeHooks) {
        this.activeHooks = activeHooks;
        return this;
    }
    setActiveEvents(activeEvents) {
        this.activeEvents = activeEvents;
        return this;
    }
    setActiveCollisionTypes(activeCollisionTypes) {
        this.activeCollisionTypes = activeCollisionTypes;
        return this;
    }
    setContactForceEventThreshold(threshold) {
        this.contactForceEventThreshold = threshold;
        return this;
    }
}
