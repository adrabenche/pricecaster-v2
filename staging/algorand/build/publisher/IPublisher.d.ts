import { StatusCode } from '../common/statusCodes';
export declare type PublishInfo = {
    status: StatusCode;
    reason?: '';
    msgb64?: '';
    confirmation?: Promise<Record<string, any>>;
    txid?: string;
};
export interface IPublisher {
    start(): void;
    stop(): void;
    publish(data: any): Promise<PublishInfo>;
}
//# sourceMappingURL=IPublisher.d.ts.map