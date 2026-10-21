import { RawCCDSolver } from "../raw";
export class CCDSolver {
    free() {
        if (!!this.raw) {
            this.raw.free();
        }
        this.raw = undefined;
    }
    constructor(raw) {
        this.raw = raw || new RawCCDSolver();
    }
}
