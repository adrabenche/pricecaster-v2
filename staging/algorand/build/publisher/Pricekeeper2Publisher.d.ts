import algosdk from 'algosdk';
import { IPublisher, PublishInfo } from './IPublisher';
import { PythData } from 'backend/common/basetypes';
export declare class Pricekeeper2Publisher implements IPublisher {
    private algodClient;
    private pclib;
    private account;
    private vaaProcessorAppId;
    private vaaProcessorOwner;
    private numOfVerifySteps;
    private guardianCount;
    private stepSize;
    private dumpFailedTx;
    private dumpFailedTxDirectory;
    private compiledVerifyProgram;
    constructor(vaaProcessorAppId: number, priceKeeperAppId: number, vaaProcessorOwner: string, verifyProgramBinary: Uint8Array, verifyProgramHash: string, signKey: algosdk.Account, algoClientToken: string, algoClientServer: string, algoClientPort: string, dumpFailedTx?: boolean, dumpFailedTxDirectory?: string);
    start(): Promise<void>;
    stop(): void;
    signCallback(sender: string, tx: algosdk.Transaction): Uint8Array;
    publish(data: PythData): Promise<PublishInfo>;
}
//# sourceMappingURL=Pricekeeper2Publisher.d.ts.map