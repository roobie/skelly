import { RawJointAxis, RawJointType, } from "../raw";
export class MultibodyJoint {
    constructor(rawSet, handle) {
        this.rawSet = rawSet;
        this.handle = handle;
    }
    static newTyped(rawSet, handle) {
        switch (rawSet.jointType(handle)) {
            case RawJointType.Revolute:
                return new RevoluteMultibodyJoint(rawSet, handle);
            case RawJointType.Prismatic:
                return new PrismaticMultibodyJoint(rawSet, handle);
            case RawJointType.Fixed:
                return new FixedMultibodyJoint(rawSet, handle);
            case RawJointType.Spherical:
                return new SphericalMultibodyJoint(rawSet, handle);
            default:
                return new MultibodyJoint(rawSet, handle);
        }
    }
    isValid() {
        return this.rawSet.contains(this.handle);
    }
    setContactsEnabled(enabled) {
        this.rawSet.jointSetContactsEnabled(this.handle, enabled);
    }
    contactsEnabled() {
        return this.rawSet.jointContactsEnabled(this.handle);
    }
}
export class UnitMultibodyJoint extends MultibodyJoint {
}
export class FixedMultibodyJoint extends MultibodyJoint {
}
export class PrismaticMultibodyJoint extends UnitMultibodyJoint {
    rawAxis() {
        return RawJointAxis.LinX;
    }
}
export class RevoluteMultibodyJoint extends UnitMultibodyJoint {
    rawAxis() {
        return RawJointAxis.AngX;
    }
}
export class SphericalMultibodyJoint extends MultibodyJoint {
}
