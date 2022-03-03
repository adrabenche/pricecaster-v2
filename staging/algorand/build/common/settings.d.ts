import { Options } from '@randlabs/js-logger';
import { Cluster } from '@solana/web3.js';
export interface IAppSettings extends Record<string, unknown> {
    log: Options;
    pollInterval: number;
    algo: {
        token: string;
        api: string;
        port: string;
        dumpFailedTx: boolean;
        dumpFailedTxDirectory?: string;
    };
    apps: {
        priceKeeperV2AppId: number;
        ownerAddress: string;
        ownerKeyFile: string;
        vaaVerifyProgramBinFile: string;
        vaaVerifyProgramHash: string;
        vaaProcessorAppId: number;
    };
    pyth: {
        chainId: number;
        emitterAddress: string;
    };
    debug?: {
        logAllVaa?: boolean;
    };
    wormhole: {
        spyServiceHost: string;
    };
    symbols: {
        sourceNetwork: Cluster;
    };
}
//# sourceMappingURL=settings.d.ts.map