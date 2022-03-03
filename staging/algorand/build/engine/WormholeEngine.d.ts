import { IEngine } from './IEngine';
import { IAppSettings } from '../common/settings';
import { IPriceFetcher } from '../fetcher/IPriceFetcher';
import { IPublisher } from '../publisher/IPublisher';
export declare class WormholeClientEngine implements IEngine {
    private settings;
    private shouldQuit;
    constructor(settings: IAppSettings);
    start(): Promise<void>;
    callWorkerRoutine(fetcher: IPriceFetcher, publisher: IPublisher): Promise<void>;
}
//# sourceMappingURL=WormholeEngine.d.ts.map