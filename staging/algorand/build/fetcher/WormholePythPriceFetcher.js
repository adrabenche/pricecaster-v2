"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WormholePythPriceFetcher = void 0;
const wasm_1 = require("@certusone/wormhole-sdk/lib/cjs/solana/wasm");
const wormhole_spydk_1 = require("@certusone/wormhole-spydk");
const Logger = __importStar(require("@randlabs/js-logger"));
const utils_1 = require("ethers/lib/utils");
const { extract3 } = require('../../tools/app-tools');
class WormholePythPriceFetcher {
    constructor(spyRpcServiceHost, pythChainId, pythEmitterAddress, symbolInfo) {
        (0, wasm_1.setDefaultWasm)('node');
        this._hasData = false;
        this.client = (0, wormhole_spydk_1.createSpyRPCServiceClient)(spyRpcServiceHost);
        this.pythChainId = pythChainId;
        this.symbolInfo = symbolInfo;
        this.pythEmitterAddress = {
            data: Buffer.from(pythEmitterAddress, 'hex').toJSON().data,
            s: pythEmitterAddress
        };
    }
    async start() {
        this.coreWasm = await (0, wasm_1.importCoreWasm)();
        this.stream = await (0, wormhole_spydk_1.subscribeSignedVAA)(this.client, {
            filters: [{
                    emitterFilter: {
                        chainId: this.pythChainId,
                        emitterAddress: this.pythEmitterAddress.s
                    }
                }]
        });
        this.stream.on('data', (data) => {
            try {
                this.onPythData(data.vaaBytes);
            }
            catch (e) {
                Logger.error(`Failed to parse VAA data. \nReason: ${e}\nData: ${data}`);
            }
        });
        this.stream.on('error', (e) => {
            Logger.error('Stream error: ' + e);
        });
    }
    stop() {
        this._hasData = false;
    }
    setStrategy(s) {
    }
    hasData() {
        return this._hasData;
    }
    queryData(id) {
        const data = this.data;
        this.data = undefined;
        return data;
    }
    async onPythData(vaaBytes) {
        const v = this.coreWasm.parse_vaa(new Uint8Array(vaaBytes));
        const payload = Buffer.from(v.payload);
        const header = payload.readInt32BE(0);
        const version = payload.readInt16BE(4);
        if (header === 0x50325748) {
            if (version === 2) {
                const payloadId = payload.readUInt8(6);
                if (payloadId === 2) {
                    const numAttest = payload.readInt16BE(7);
                    const sizeAttest = payload.readInt16BE(9);
                    const attestations = [];
                    for (let i = 0; i < numAttest; ++i) {
                        const attestation = extract3(payload, 11 + (i * sizeAttest), sizeAttest);
                        const productId = extract3(attestation, 7, 32);
                        const priceId = extract3(attestation, 7 + 32, 32);
                        const pythAttest = {
                            symbol: this.symbolInfo.getSymbol(utils_1.base58.encode(productId), utils_1.base58.encode(priceId)),
                            productId,
                            priceId,
                            price_type: attestation.readInt8(71),
                            price: attestation.readBigUInt64BE(72),
                            exponent: attestation.readInt32BE(80),
                            twap: attestation.readBigUInt64BE(84),
                            twap_num_upd: attestation.readBigUInt64BE(92),
                            twap_denom_upd: attestation.readBigUInt64BE(100),
                            twac: attestation.readBigUInt64BE(108),
                            twac_num_upd: attestation.readBigUInt64BE(116),
                            twac_denom_upd: attestation.readBigUInt64BE(124),
                            confidence: attestation.readBigUInt64BE(132),
                            status: attestation.readInt8(140),
                            corporate_act: attestation.readInt8(141),
                            timestamp: attestation.readBigUInt64BE(142)
                        };
                        attestations.push(pythAttest);
                    }
                    this.data = {
                        vaaBody: vaaBytes.slice(6 + v.signatures.length * 66),
                        signatures: vaaBytes.slice(6, 6 + v.signatures.length * 66),
                        attestations
                    };
                    Logger.info(`VAA gs=${v.guardian_set_index} #sig=${v.signatures.length} ts=${v.timestamp} nonce=${v.nonce} seq=${v.sequence} clev=${v.consistency_level} payload_size=${payload.length} #attestations=${numAttest}`);
                    this._hasData = true;
                }
                else {
                    Logger.error(`Bad Pyth VAA payload Id (${payloadId}). Expected 2`);
                }
            }
            else {
                Logger.error(`Bad Pyth VAA version (${version}). Expected 2`);
            }
        }
        else {
            Logger.error(`Bad VAA header (0x${header.toString(16)}). Expected 'P2WH'`);
        }
    }
}
exports.WormholePythPriceFetcher = WormholePythPriceFetcher;
//# sourceMappingURL=WormholePythPriceFetcher.js.map