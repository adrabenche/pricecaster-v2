"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythSymbolInfo = void 0;
const client_1 = require("@pythnetwork/client");
const web3_js_1 = require("@solana/web3.js");
const CLUSTER_TO_PYTH_PROGRAM_KEY = {
    'mainnet-beta': 'FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH',
    devnet: 'gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s',
    testnet: '8tfDNiaEyrV6Q1U4DEXrEigs9DoDtkugzFbybENEbCDz'
};
class PythSymbolInfo {
    constructor(network) {
        this.symbolMap = new Map();
        this.network = network;
    }
    getPythProgramKeyForCluster(cluster) {
        if (CLUSTER_TO_PYTH_PROGRAM_KEY[cluster] !== undefined) {
            return new web3_js_1.PublicKey(CLUSTER_TO_PYTH_PROGRAM_KEY[cluster]);
        }
        else {
            throw new Error(`Invalid Solana cluster name: ${cluster}. Valid options are: ${JSON.stringify(Object.keys(CLUSTER_TO_PYTH_PROGRAM_KEY))}`);
        }
    }
    async load() {
        const connection = new web3_js_1.Connection((0, web3_js_1.clusterApiUrl)(this.network));
        const pythPublicKey = this.getPythProgramKeyForCluster(this.network);
        const accounts = await connection.getProgramAccounts(pythPublicKey, 'finalized');
        for (const acc of accounts) {
            const productData = (0, client_1.parseProductData)(acc.account.data);
            if (productData.type === 2) {
                this.symbolMap.set(acc.pubkey.toBase58() + productData.priceAccountKey.toBase58(), productData.product.symbol);
            }
        }
    }
    getSymbol(productId, priceId) {
        return this.symbolMap.get(productId + priceId);
    }
    getSymbolCount() {
        return this.symbolMap.size;
    }
}
exports.PythSymbolInfo = PythSymbolInfo;
//# sourceMappingURL=SymbolInfo.js.map