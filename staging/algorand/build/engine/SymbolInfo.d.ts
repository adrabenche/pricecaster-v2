import { Cluster } from '@solana/web3.js';
export declare class PythSymbolInfo {
    private network;
    private symbolMap;
    constructor(network: Cluster);
    private getPythProgramKeyForCluster;
    load(): Promise<void>;
    getSymbol(productId: string, priceId: string): string | undefined;
    getSymbolCount(): number;
}
//# sourceMappingURL=SymbolInfo.d.ts.map