"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyBase = void 0;
class StrategyBase {
    constructor(bufSize = 10) {
        this.createBuffer(bufSize);
    }
    createBuffer(maxSize) {
        this.buffer = [];
        this.bufSize = maxSize;
    }
    clearBuffer() {
        this.buffer.length = 0;
    }
    bufferCount() {
        return this.buffer.length;
    }
    put(ticker) {
        if (this.buffer.length === this.bufSize) {
            this.buffer.shift();
        }
        this.buffer.push(ticker);
        return true;
    }
}
exports.StrategyBase = StrategyBase;
//# sourceMappingURL=strategyBase.js.map