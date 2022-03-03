/// <reference types="node" />
export declare type VAA = {
    version: number;
    guardian_set_index: number;
    signatures: [];
    timestamp: number;
    nonce: number;
    emitter_chain: number;
    emitter_address: [];
    sequence: number;
    consistency_level: number;
    payload: [];
};
export declare type PythAttestation = {
    symbol?: string;
    productId: string;
    priceId: string;
    price_type?: number;
    price?: BigInt;
    exponent?: number;
    twap?: BigInt;
    twap_num_upd?: BigInt;
    twap_denom_upd?: BigInt;
    twac?: BigInt;
    twac_num_upd?: BigInt;
    twac_denom_upd?: BigInt;
    confidence?: BigInt;
    status?: number;
    corporate_act?: number;
    timestamp?: BigInt;
};
export declare type PythData = {
    vaaBody: Buffer;
    signatures: Buffer;
    attestations?: PythAttestation[];
};
//# sourceMappingURL=basetypes.d.ts.map