//@ts-nocheck
export default class Pool {
    retrieve(e) {
        if (null != e) {
            for (; e >= this.size;)
                this.expand(this.originalSize);
            return this.numActive++, (this.objects[e].active = !0), this.objects[e];
        }
        var t = this.idx;
        do {
            t = (t + 1) % this.size;
            var i = this.objects[t];
            if (!i.active)
                return (this.idx = t), this.numActive++, (i.active = !0), i;
        } while (t != this.idx);
        return (this.expand(this.originalSize),
            console.log("Expanding pool for: " + this.objects[0].constructor.name + " to: " + this.size),
            this.retrieve());
    }
    recycle(e) {
        (e.active = !1), this.numActive--;
    }
    expand(e) {
        for (var t = 0; t < e; t++) {
            var i = this.constructorFn();
            (i.id = t + this.size), (i.active = !1), this.objects.push(i);
        }
        this.size += e;
    }
    constructor(e, t) {
        (this.size = 0), (this.originalSize = t), (this.constructorFn = e), (this.objects = []), (this.idx = 0), (this.numActive = 0), this.expand(t);
    }
    forEachActive(e) {
        for (var t = 0; t < this.size; t++) {
            var i = this.objects[t];
            !0 === i.active && e(i, t);
        }
    }
}
;
