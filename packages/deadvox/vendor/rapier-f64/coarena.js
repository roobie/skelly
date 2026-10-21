export class Coarena {
    constructor() {
        this.fconv = new Float64Array(1);
        this.uconv = new Uint32Array(this.fconv.buffer);
        this.data = new Array();
        this.size = 0;
    }
    set(handle, data) {
        let i = this.index(handle);
        while (this.data.length <= i) {
            this.data.push(null);
        }
        if (this.data[i] == null)
            this.size += 1;
        this.data[i] = data;
    }
    len() {
        return this.size;
    }
    delete(handle) {
        let i = this.index(handle);
        if (i < this.data.length) {
            if (this.data[i] != null)
                this.size -= 1;
            this.data[i] = null;
        }
    }
    clear() {
        this.data = new Array();
    }
    get(handle) {
        let i = this.index(handle);
        if (i < this.data.length) {
            return this.data[i];
        }
        else {
            return null;
        }
    }
    forEach(f) {
        for (const elt of this.data) {
            if (elt != null)
                f(elt);
        }
    }
    getAll() {
        return this.data.filter((elt) => elt != null);
    }
    index(handle) {
        this.fconv[0] = handle;
        return this.uconv[0];
    }
}
