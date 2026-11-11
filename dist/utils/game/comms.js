//@ts-nocheck
export class CommIn {
    static isMoreDataAvailable() {
        return Math.max(0, this.buffer.length - this.idx);
    }
    static peekInt8U() {
        return this.buffer[this.idx];
    }
    static init(e) {
        (this.buffer = new Uint8Array(e)), (this.idx = 0);
    }
    static unPackRadU() {
        return this.unPackInt24U() / 2097152;
    }
    static unPackLongString(e) {
        e = e || 16383;
        var t = Math.min(this.unPackInt16U(), e);
        return this.unPackStringHelper(t);
    }
    static unPackInt16() {
        return ((this.unPackInt16U() + 32768) % 65536) - 32768;
    }
    static unPackInt32() {
        return ((this.unPackInt32U() + 2147483648) % 4294967296) - 2147483648;
    }
    static unPackInt8() {
        return ((this.unPackInt8U() + 128) % 256) - 128;
    }
    static unPackInt32U() {
        var e = this.idx;
        return (this.idx += 4), this.buffer[e] + 256 * this.buffer[e + 1] + 65536 * this.buffer[e + 2] + 16777216 * this.buffer[e + 3];
    }
    static unPackInt16U() {
        var e = this.idx;
        return (this.idx += 2), this.buffer[e] + 256 * this.buffer[e + 1];
    }
    static unPackString(e) {
        e = e || 255;
        var t = Math.min(this.unPackInt8U(), e);
        return this.unPackStringHelper(t);
    }
    static unPackInt24U() {
        var e = this.idx;
        return (this.idx += 3), this.buffer[e] + 256 * this.buffer[e + 1] + 65536 * this.buffer[e + 2];
    }
    static unPackStringHelper(e) {
        if (this.isMoreDataAvailable() < e)
            return 0;
        for (var t = new String(), i = 0; i < e; i++) {
            var a = this.unPackInt16U();
            a > 0 && (t += String.fromCodePoint(a));
        }
        return t;
    }
    static unPackInt8U() {
        var e = this.idx;
        return this.idx++, this.buffer[e];
    }
    static unPackDouble() {
        return this.unPackInt32() / 1048576;
    }
    static unPackRad() {
        return this.unPackInt16U() / 8192 - Math.PI;
    }
    static unPackFloat() {
        return this.unPackInt16() / 256;
    }
}
;
export class CommOut {
    idx;
    arrayBuffer;
    buffer;
    constructor(size = 16384) {
        this.idx = 0;
        this.arrayBuffer = new ArrayBuffer(size);
        this.buffer = new Uint8Array(this.arrayBuffer, 0, size);
    }
    send(ws2) {
        const b2 = new Uint8Array(this.arrayBuffer, 0, this.idx);
        ws2.send(b2);
    }
    packInt8(val) {
        this.buffer[this.idx] = val & 255;
        this.idx++;
    }
    packInt16(val) {
        this.buffer[this.idx] = val & 255;
        this.buffer[this.idx + 1] = val >> 8 & 255;
        this.idx += 2;
    }
    packInt24(val) {
        this.buffer[this.idx] = val & 255;
        this.buffer[this.idx + 1] = val >> 8 & 255;
        this.buffer[this.idx + 2] = val >> 16 & 255;
        this.idx += 3;
    }
    packInt32(val) {
        this.buffer[this.idx] = val & 255;
        this.buffer[this.idx + 1] = val >> 8 & 255;
        this.buffer[this.idx + 2] = val >> 16 & 255;
        this.buffer[this.idx + 3] = val >> 24 & 255;
        this.idx += 4;
    }
    packRadU(val) {
        this.packInt24(val * 2097152);
    }
    packRad(val) {
        this.packInt16((val + Math.PI) * 8192);
    }
    packFloat(val) {
        this.packInt16(val * 256);
    }
    packDouble(val) {
        this.packInt32(val * 1048576);
    }
    packString(str) {
        if (typeof str !== 'string')
            str = '';
        this.packInt8(str.length);
        for (let i2 = 0; i2 < str.length; i2++)
            this.packInt16(str.charCodeAt(i2));
    }
    packLongString(str) {
        if (typeof str !== 'string')
            str = '';
        this.packInt16(str.length);
        for (let i2 = 0; i2 < str.length; i2++)
            this.packInt16(str.charCodeAt(i2));
    }
}
export default CommOut;
