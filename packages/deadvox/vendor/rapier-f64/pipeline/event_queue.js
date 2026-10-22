import { RawEventQueue } from "../raw";
import { VectorOps } from "../math";
export var ActiveEvents;
(function (ActiveEvents) {
    ActiveEvents[ActiveEvents["NONE"] = 0] = "NONE";
    ActiveEvents[ActiveEvents["COLLISION_EVENTS"] = 1] = "COLLISION_EVENTS";
    ActiveEvents[ActiveEvents["CONTACT_FORCE_EVENTS"] = 2] = "CONTACT_FORCE_EVENTS";
})(ActiveEvents || (ActiveEvents = {}));
export class TempContactForceEvent {
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    collider1() {
        return this.raw.collider1();
    }
    collider2() {
        return this.raw.collider2();
    }
    totalForce() {
        return VectorOps.fromRaw(this.raw.total_force());
    }
    totalForceMagnitude() {
        return this.raw.total_force_magnitude();
    }
    maxForceDirection() {
        return VectorOps.fromRaw(this.raw.max_force_direction());
    }
    maxForceMagnitude() {
        return this.raw.max_force_magnitude();
    }
}
export class EventQueue {
    constructor(autoDrain, raw) {
        this.raw = raw || new RawEventQueue(autoDrain);
    }
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    drainCollisionEvents(f) {
        this.raw.drainCollisionEvents(f);
    }
    drainContactForceEvents(f) {
        let event = new TempContactForceEvent();
        this.raw.drainContactForceEvents((raw) => {
            event.raw = raw;
            f(event);
            event.free();
        });
    }
    clear() {
        this.raw.clear();
    }
}
