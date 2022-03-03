import { IStrategy } from '../strategy/strategy';
import { IPriceFetcher } from './IPriceFetcher';
import { PythSymbolInfo } from 'backend/engine/SymbolInfo';
export declare class WormholePythPriceFetcher implements IPriceFetcher {
    private client;
    private pythEmitterAddress;
    private pythChainId;
    private stream;
    private _hasData;
    private coreWasm;
    private data;
    private symbolInfo;
    constructor(spyRpcServiceHost: string, pythChainId: number, pythEmitterAddress: string, symbolInfo: PythSymbolInfo);
    start(): Promise<void>;
    stop(): void;
    setStrategy(s: IStrategy): void;
    hasData(): boolean;
    queryData(id?: string): any | undefined;
    private onPythData;
}
//# sourceMappingURL=WormholePythPriceFetcher.d.ts.map