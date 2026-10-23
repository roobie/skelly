import { RawDebugRenderPipeline } from "../raw";
export class DebugRenderBuffers {
    constructor(vertices, colors) {
        this.vertices = vertices;
        this.colors = colors;
    }
}
export class DebugRenderPipeline {
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
        this.vertices = undefined;
        this.colors = undefined;
    }
    constructor(raw) {
        this.raw = raw || new RawDebugRenderPipeline();
    }
    render(bodies, colliders, impulse_joints, multibody_joints, narrow_phase, filterFlags, filterPredicate) {
        this.raw.render(bodies.raw, colliders.raw, impulse_joints.raw, multibody_joints.raw, narrow_phase.raw, filterFlags, colliders.castClosure(filterPredicate));
        this.vertices = this.raw.vertices();
        this.colors = this.raw.colors();
    }
}
