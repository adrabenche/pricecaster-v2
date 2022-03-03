"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyLastPrice = void 0;
const strategyBase_1 = require("./strategyBase");
class StrategyLastPrice extends strategyBase_1.StrategyBase {
    getPrice() {
        const ret = this.buffer[this.buffer.length - 1];
        this.clearBuffer();
        return ret;
    }
}
exports.StrategyLastPrice = StrategyLastPrice;
//# sourceMappingURL=strategyLastPrice.js.map