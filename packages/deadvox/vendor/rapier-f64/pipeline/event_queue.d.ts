import { RawContactForceEvent, RawEventQueue } from "../raw";
import { SoftBodyTearEvent } from "../dynamics";
import { ColliderHandle } from "../geometry";
import { Vector } from "../math";
export declare enum ActiveEvents {
    NONE = 0,
    COLLISION_EVENTS = 1,
    CONTACT_FORCE_EVENTS = 2
}
export declare class TempContactForceEvent {
    raw: RawContactForceEvent;
    free(): void;
    collider1(): ColliderHandle;
    collider2(): ColliderHandle;
    totalForce(target?: Vector): Vector;
    totalForceMagnitude(): number;
    maxForceDirection(target?: Vector): Vector;
    maxForceMagnitude(): number;
}
export declare class EventQueue {
    raw: RawEventQueue;
    constructor(autoDrain: boolean, raw?: RawEventQueue);
    free(): void;
    drainCollisionEvents(f: (handle1: ColliderHandle, handle2: ColliderHandle, started: boolean) => void): void;
    drainContactForceEvents(f: (event: TempContactForceEvent) => void): void;
    drainSoftBodyTearEvents(f: (event: SoftBodyTearEvent) => void): void;
    clear(): void;
}
