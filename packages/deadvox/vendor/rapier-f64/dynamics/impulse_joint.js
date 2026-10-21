import { VectorOps, RotationOps } from "../math";
import { RawGenericJoint, RawJointAxis, RawJointType, } from "../raw";
export var JointType;
(function (JointType) {
    JointType[JointType["Revolute"] = 0] = "Revolute";
    JointType[JointType["Fixed"] = 1] = "Fixed";
    JointType[JointType["Prismatic"] = 2] = "Prismatic";
    JointType[JointType["Rope"] = 3] = "Rope";
    JointType[JointType["Spring"] = 4] = "Spring";
    JointType[JointType["Spherical"] = 5] = "Spherical";
    JointType[JointType["Generic"] = 6] = "Generic";
})(JointType || (JointType = {}));
export var MotorModel;
(function (MotorModel) {
    MotorModel[MotorModel["AccelerationBased"] = 0] = "AccelerationBased";
    MotorModel[MotorModel["ForceBased"] = 1] = "ForceBased";
})(MotorModel || (MotorModel = {}));
export var JointAxesMask;
(function (JointAxesMask) {
    JointAxesMask[JointAxesMask["LinX"] = 1] = "LinX";
    JointAxesMask[JointAxesMask["LinY"] = 2] = "LinY";
    JointAxesMask[JointAxesMask["LinZ"] = 4] = "LinZ";
    JointAxesMask[JointAxesMask["AngX"] = 8] = "AngX";
    JointAxesMask[JointAxesMask["AngY"] = 16] = "AngY";
    JointAxesMask[JointAxesMask["AngZ"] = 32] = "AngZ";
})(JointAxesMask || (JointAxesMask = {}));
export class ImpulseJoint {
    constructor(rawSet, bodySet, handle) {
        this.rawSet = rawSet;
        this.bodySet = bodySet;
        this.handle = handle;
    }
    static newTyped(rawSet, bodySet, handle) {
        switch (rawSet.jointType(handle)) {
            case RawJointType.Revolute:
                return new RevoluteImpulseJoint(rawSet, bodySet, handle);
            case RawJointType.Prismatic:
                return new PrismaticImpulseJoint(rawSet, bodySet, handle);
            case RawJointType.Fixed:
                return new FixedImpulseJoint(rawSet, bodySet, handle);
            case RawJointType.Spring:
                return new SpringImpulseJoint(rawSet, bodySet, handle);
            case RawJointType.Rope:
                return new RopeImpulseJoint(rawSet, bodySet, handle);
            case RawJointType.Spherical:
                return new SphericalImpulseJoint(rawSet, bodySet, handle);
            case RawJointType.Generic:
                return new GenericImpulseJoint(rawSet, bodySet, handle);
            default:
                return new ImpulseJoint(rawSet, bodySet, handle);
        }
    }
    finalizeDeserialization(bodySet) {
        this.bodySet = bodySet;
    }
    isValid() {
        return this.rawSet.contains(this.handle);
    }
    body1() {
        return this.bodySet.get(this.rawSet.jointBodyHandle1(this.handle));
    }
    body2() {
        return this.bodySet.get(this.rawSet.jointBodyHandle2(this.handle));
    }
    type() {
        return this.rawSet.jointType(this.handle);
    }
    frameX1() {
        return RotationOps.fromRaw(this.rawSet.jointFrameX1(this.handle));
    }
    frameX2() {
        return RotationOps.fromRaw(this.rawSet.jointFrameX2(this.handle));
    }
    anchor1() {
        return VectorOps.fromRaw(this.rawSet.jointAnchor1(this.handle));
    }
    anchor2() {
        return VectorOps.fromRaw(this.rawSet.jointAnchor2(this.handle));
    }
    setAnchor1(newPos) {
        const rawPoint = VectorOps.intoRaw(newPos);
        this.rawSet.jointSetAnchor1(this.handle, rawPoint);
        rawPoint.free();
    }
    setAnchor2(newPos) {
        const rawPoint = VectorOps.intoRaw(newPos);
        this.rawSet.jointSetAnchor2(this.handle, rawPoint);
        rawPoint.free();
    }
    setContactsEnabled(enabled) {
        this.rawSet.jointSetContactsEnabled(this.handle, enabled);
    }
    contactsEnabled() {
        return this.rawSet.jointContactsEnabled(this.handle);
    }
}
export class UnitImpulseJoint extends ImpulseJoint {
    limitsEnabled() {
        return this.rawSet.jointLimitsEnabled(this.handle, this.rawAxis());
    }
    limitsMin() {
        return this.rawSet.jointLimitsMin(this.handle, this.rawAxis());
    }
    limitsMax() {
        return this.rawSet.jointLimitsMax(this.handle, this.rawAxis());
    }
    setLimits(min, max) {
        this.rawSet.jointSetLimits(this.handle, this.rawAxis(), min, max);
    }
    configureMotorModel(model) {
        this.rawSet.jointConfigureMotorModel(this.handle, this.rawAxis(), model);
    }
    configureMotorVelocity(targetVel, factor) {
        this.rawSet.jointConfigureMotorVelocity(this.handle, this.rawAxis(), targetVel, factor);
    }
    configureMotorPosition(targetPos, stiffness, damping) {
        this.rawSet.jointConfigureMotorPosition(this.handle, this.rawAxis(), targetPos, stiffness, damping);
    }
    configureMotor(targetPos, targetVel, stiffness, damping) {
        this.rawSet.jointConfigureMotor(this.handle, this.rawAxis(), targetPos, targetVel, stiffness, damping);
    }
}
export class FixedImpulseJoint extends ImpulseJoint {
}
export class RopeImpulseJoint extends ImpulseJoint {
}
export class SpringImpulseJoint extends ImpulseJoint {
}
export class PrismaticImpulseJoint extends UnitImpulseJoint {
    rawAxis() {
        return RawJointAxis.LinX;
    }
}
export class RevoluteImpulseJoint extends UnitImpulseJoint {
    rawAxis() {
        return RawJointAxis.AngX;
    }
}
export class GenericImpulseJoint extends ImpulseJoint {
}
export class SphericalImpulseJoint extends ImpulseJoint {
}
export class JointData {
    constructor() { }
    static fixed(anchor1, frame1, anchor2, frame2) {
        let res = new JointData();
        res.anchor1 = anchor1;
        res.anchor2 = anchor2;
        res.frame1 = frame1;
        res.frame2 = frame2;
        res.jointType = JointType.Fixed;
        return res;
    }
    static spring(rest_length, stiffness, damping, anchor1, anchor2) {
        let res = new JointData();
        res.anchor1 = anchor1;
        res.anchor2 = anchor2;
        res.length = rest_length;
        res.stiffness = stiffness;
        res.damping = damping;
        res.jointType = JointType.Spring;
        return res;
    }
    static rope(length, anchor1, anchor2) {
        let res = new JointData();
        res.anchor1 = anchor1;
        res.anchor2 = anchor2;
        res.length = length;
        res.jointType = JointType.Rope;
        return res;
    }
    static generic(anchor1, anchor2, axis, axesMask) {
        let res = new JointData();
        res.anchor1 = anchor1;
        res.anchor2 = anchor2;
        res.axis = axis;
        res.axesMask = axesMask;
        res.jointType = JointType.Generic;
        return res;
    }
    static spherical(anchor1, anchor2) {
        let res = new JointData();
        res.anchor1 = anchor1;
        res.anchor2 = anchor2;
        res.jointType = JointType.Spherical;
        return res;
    }
    static prismatic(anchor1, anchor2, axis) {
        let res = new JointData();
        res.anchor1 = anchor1;
        res.anchor2 = anchor2;
        res.axis = axis;
        res.jointType = JointType.Prismatic;
        return res;
    }
    static revolute(anchor1, anchor2, axis) {
        let res = new JointData();
        res.anchor1 = anchor1;
        res.anchor2 = anchor2;
        res.axis = axis;
        res.jointType = JointType.Revolute;
        return res;
    }
    intoRaw() {
        let rawA1 = VectorOps.intoRaw(this.anchor1);
        let rawA2 = VectorOps.intoRaw(this.anchor2);
        let rawAx;
        let result;
        let limitsEnabled = false;
        let limitsMin = 0.0;
        let limitsMax = 0.0;
        switch (this.jointType) {
            case JointType.Fixed:
                let rawFra1 = RotationOps.intoRaw(this.frame1);
                let rawFra2 = RotationOps.intoRaw(this.frame2);
                result = RawGenericJoint.fixed(rawA1, rawFra1, rawA2, rawFra2);
                rawFra1.free();
                rawFra2.free();
                break;
            case JointType.Spring:
                result = RawGenericJoint.spring(this.length, this.stiffness, this.damping, rawA1, rawA2);
                break;
            case JointType.Rope:
                result = RawGenericJoint.rope(this.length, rawA1, rawA2);
                break;
            case JointType.Prismatic:
                rawAx = VectorOps.intoRaw(this.axis);
                if (!!this.limitsEnabled) {
                    limitsEnabled = true;
                    limitsMin = this.limits[0];
                    limitsMax = this.limits[1];
                }
                result = RawGenericJoint.prismatic(rawA1, rawA2, rawAx, limitsEnabled, limitsMin, limitsMax);
                rawAx.free();
                break;
            case JointType.Generic:
                rawAx = VectorOps.intoRaw(this.axis);
                let rawAxesMask = this.axesMask;
                result = RawGenericJoint.generic(rawA1, rawA2, rawAx, rawAxesMask);
                break;
            case JointType.Spherical:
                result = RawGenericJoint.spherical(rawA1, rawA2);
                break;
            case JointType.Revolute:
                rawAx = VectorOps.intoRaw(this.axis);
                result = RawGenericJoint.revolute(rawA1, rawA2, rawAx);
                rawAx.free();
                break;
        }
        rawA1.free();
        rawA2.free();
        return result;
    }
}
