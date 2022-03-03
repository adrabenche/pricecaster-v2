"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceTicker = void 0;
class PriceTicker {
    constructor(symbol, price, price_type, confidence, exponent, twap, twac, timestamp, user_data) {
        this._symbol = symbol;
        this._price = price;
        this._price_type = price_type;
        this._confidence = confidence;
        this._exponent = exponent;
        this._timestamp = timestamp;
        this._twap = twap;
        this._twac = twac;
        this._user_data = user_data;
    }
    get symbol() {
        return this._symbol;
    }
    set symbol(value) {
        this._symbol = value;
    }
    get price() {
        return this._price;
    }
    set price(value) {
        this._price = value;
    }
    get price_type() {
        return this._price_type;
    }
    set price_type(value) {
        this._price_type = value;
    }
    get confidence() {
        return this._confidence;
    }
    set confidence(value) {
        this._confidence = value;
    }
    get exponent() {
        return this._exponent;
    }
    set exponent(value) {
        this._exponent = value;
    }
    get timestamp() {
        return this._timestamp;
    }
    set timestamp(value) {
        this._timestamp = value;
    }
    get twac() {
        return this._twac;
    }
    set twac(value) {
        this._twac = value;
    }
    get twap() {
        return this._twap;
    }
    set twap(value) {
        this._twap = value;
    }
    get user_data() {
        return this._user_data;
    }
    set user_data(value) {
        this._user_data = value;
    }
}
exports.PriceTicker = PriceTicker;
//# sourceMappingURL=priceTicker.js.map