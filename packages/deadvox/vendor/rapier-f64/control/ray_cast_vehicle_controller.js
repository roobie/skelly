import { RawDynamicRayCastVehicleController } from "../raw";
import { scratchBuffer, VectorOps } from "../math";
export class DynamicRayCastVehicleController {
    constructor(chassis, broadPhase, narrowPhase, bodies, colliders) {
        this.raw = new RawDynamicRayCastVehicleController(chassis.handle);
        this.broadPhase = broadPhase;
        this.narrowPhase = narrowPhase;
        this.bodies = bodies;
        this.colliders = colliders;
        this._chassis = chassis;
    }
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    updateVehicle(dt, filterFlags, filterGroups, filterPredicate) {
        this.raw.update_vehicle(dt, this.broadPhase.raw, this.narrowPhase.raw, this.bodies.raw, this.colliders.raw, filterFlags, filterGroups, this.colliders.castClosure(filterPredicate));
    }
    currentVehicleSpeed() {
        return this.raw.current_vehicle_speed();
    }
    chassis() {
        return this._chassis;
    }
    get indexUpAxis() {
        return this.raw.index_up_axis();
    }
    set indexUpAxis(axis) {
        this.raw.set_index_up_axis(axis);
    }
    get indexForwardAxis() {
        return this.raw.index_forward_axis();
    }
    set setIndexForwardAxis(axis) {
        this.raw.set_index_forward_axis(axis);
    }
    addWheel(chassisConnectionCs, directionCs, axleCs, suspensionRestLength, radius) {
        let rawChassisConnectionCs = VectorOps.intoRaw(chassisConnectionCs);
        let rawDirectionCs = VectorOps.intoRaw(directionCs);
        let rawAxleCs = VectorOps.intoRaw(axleCs);
        this.raw.add_wheel(rawChassisConnectionCs, rawDirectionCs, rawAxleCs, suspensionRestLength, radius);
        rawChassisConnectionCs.free();
        rawDirectionCs.free();
        rawAxleCs.free();
    }
    numWheels() {
        return this.raw.num_wheels();
    }
    wheelChassisConnectionPointCs(i, target) {
        const exists = this.raw.wheel_chassis_connection_point_cs(i, scratchBuffer);
        return exists ? VectorOps.fromBuffer(scratchBuffer, target) : null;
    }
    setWheelChassisConnectionPointCs(i, value) {
        let rawValue = VectorOps.intoRaw(value);
        this.raw.set_wheel_chassis_connection_point_cs(i, rawValue);
        rawValue.free();
    }
    wheelSuspensionRestLength(i) {
        return this.raw.wheel_suspension_rest_length(i);
    }
    setWheelSuspensionRestLength(i, value) {
        this.raw.set_wheel_suspension_rest_length(i, value);
    }
    wheelMaxSuspensionTravel(i) {
        return this.raw.wheel_max_suspension_travel(i);
    }
    setWheelMaxSuspensionTravel(i, value) {
        this.raw.set_wheel_max_suspension_travel(i, value);
    }
    wheelRadius(i) {
        return this.raw.wheel_radius(i);
    }
    setWheelRadius(i, value) {
        this.raw.set_wheel_radius(i, value);
    }
    wheelSuspensionStiffness(i) {
        return this.raw.wheel_suspension_stiffness(i);
    }
    setWheelSuspensionStiffness(i, value) {
        this.raw.set_wheel_suspension_stiffness(i, value);
    }
    wheelSuspensionCompression(i) {
        return this.raw.wheel_suspension_compression(i);
    }
    setWheelSuspensionCompression(i, value) {
        this.raw.set_wheel_suspension_compression(i, value);
    }
    wheelSuspensionRelaxation(i) {
        return this.raw.wheel_suspension_relaxation(i);
    }
    setWheelSuspensionRelaxation(i, value) {
        this.raw.set_wheel_suspension_relaxation(i, value);
    }
    wheelMaxSuspensionForce(i) {
        return this.raw.wheel_max_suspension_force(i);
    }
    setWheelMaxSuspensionForce(i, value) {
        this.raw.set_wheel_max_suspension_force(i, value);
    }
    wheelBrake(i) {
        return this.raw.wheel_brake(i);
    }
    setWheelBrake(i, value) {
        this.raw.set_wheel_brake(i, value);
    }
    wheelSteering(i) {
        return this.raw.wheel_steering(i);
    }
    setWheelSteering(i, value) {
        this.raw.set_wheel_steering(i, value);
    }
    wheelEngineForce(i) {
        return this.raw.wheel_engine_force(i);
    }
    setWheelEngineForce(i, value) {
        this.raw.set_wheel_engine_force(i, value);
    }
    wheelDirectionCs(i, target) {
        const exists = this.raw.wheel_direction_cs(i, scratchBuffer);
        return exists ? VectorOps.fromBuffer(scratchBuffer, target) : null;
    }
    setWheelDirectionCs(i, value) {
        let rawValue = VectorOps.intoRaw(value);
        this.raw.set_wheel_direction_cs(i, rawValue);
        rawValue.free();
    }
    wheelAxleCs(i, target) {
        const exists = this.raw.wheel_axle_cs(i, scratchBuffer);
        return exists ? VectorOps.fromBuffer(scratchBuffer, target) : null;
    }
    setWheelAxleCs(i, value) {
        let rawValue = VectorOps.intoRaw(value);
        this.raw.set_wheel_axle_cs(i, rawValue);
        rawValue.free();
    }
    wheelFrictionSlip(i) {
        return this.raw.wheel_friction_slip(i);
    }
    setWheelFrictionSlip(i, value) {
        this.raw.set_wheel_friction_slip(i, value);
    }
    wheelSideFrictionStiffness(i) {
        return this.raw.wheel_side_friction_stiffness(i);
    }
    setWheelSideFrictionStiffness(i, value) {
        this.raw.set_wheel_side_friction_stiffness(i, value);
    }
    wheelRotation(i) {
        return this.raw.wheel_rotation(i);
    }
    wheelForwardImpulse(i) {
        return this.raw.wheel_forward_impulse(i);
    }
    wheelSideImpulse(i) {
        return this.raw.wheel_side_impulse(i);
    }
    wheelSuspensionForce(i) {
        return this.raw.wheel_suspension_force(i);
    }
    wheelContactNormal(i, target) {
        const exists = this.raw.wheel_contact_normal_ws(i, scratchBuffer);
        return exists ? VectorOps.fromBuffer(scratchBuffer, target) : null;
    }
    wheelContactPoint(i, target) {
        const exists = this.raw.wheel_contact_point_ws(i, scratchBuffer);
        return exists ? VectorOps.fromBuffer(scratchBuffer, target) : null;
    }
    wheelSuspensionLength(i) {
        return this.raw.wheel_suspension_length(i);
    }
    wheelHardPoint(i, target) {
        const exists = this.raw.wheel_hard_point_ws(i, scratchBuffer);
        return exists ? VectorOps.fromBuffer(scratchBuffer, target) : null;
    }
    wheelIsInContact(i) {
        return this.raw.wheel_is_in_contact(i);
    }
    wheelGroundObject(i) {
        return this.colliders.get(this.raw.wheel_ground_object(i));
    }
}
