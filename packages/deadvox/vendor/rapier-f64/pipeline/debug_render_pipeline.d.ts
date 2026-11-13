import { RawDebugRenderPipeline } from "../raw";
import { ImpulseJointSet, MultibodyJointSet, RigidBodySet, SoftBodySet } from "../dynamics";
import { Collider, ColliderSet, NarrowPhase } from "../geometry";
import { QueryFilterFlags } from "./query_pipeline";
export declare class DebugRenderBuffers {
    vertices: Float64Array;
    colors: Float32Array;
    constructor(vertices: Float64Array, colors: Float32Array);
}
export declare class DebugRenderPipeline {
    raw: RawDebugRenderPipeline;
    vertices: Float64Array;
    colors: Float32Array;
    free(): void;
    constructor(raw?: RawDebugRenderPipeline);
    render(bodies: RigidBodySet, colliders: ColliderSet, soft_bodies: SoftBodySet, impulse_joints: ImpulseJointSet, multibody_joints: MultibodyJointSet, narrow_phase: NarrowPhase, filterFlags?: QueryFilterFlags, filterPredicate?: (collider: Collider) => boolean): void;
}
