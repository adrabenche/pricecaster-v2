export declare class PriceTicker {
    constructor(symbol: string, price: BigInt, price_type: number, confidence: BigInt, exponent: number, twap: BigInt, twac: BigInt, timestamp: BigInt, user_data?: any);
    private _symbol;
    get symbol(): string;
    set symbol(value: string);
    private _price;
    get price(): BigInt;
    set price(value: BigInt);
    private _price_type;
    get price_type(): number;
    set price_type(value: number);
    private _confidence;
    get confidence(): BigInt;
    set confidence(value: BigInt);
    private _exponent;
    get exponent(): number;
    set exponent(value: number);
    private _timestamp;
    get timestamp(): BigInt;
    set timestamp(value: BigInt);
    private _twac;
    get twac(): BigInt;
    set twac(value: BigInt);
    private _twap;
    get twap(): BigInt;
    set twap(value: BigInt);
    private _user_data;
    get user_data(): any;
    set user_data(value: any);
}
//# sourceMappingURL=priceTicker.d.ts.map