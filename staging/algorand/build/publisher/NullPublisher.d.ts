import { IPublisher, PublishInfo } from '../publisher/IPublisher';
import { PriceTicker } from '../common/priceTicker';
export declare class NullPublisher implements IPublisher {
    start(): void;
    stop(): void;
    publish(tick: PriceTicker): Promise<PublishInfo>;
}
//# sourceMappingURL=NullPublisher.d.ts.map