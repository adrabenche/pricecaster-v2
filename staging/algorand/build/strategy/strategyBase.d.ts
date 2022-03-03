import { PriceTicker } from '../common/priceTicker';
import { IStrategy } from './strategy';
export declare abstract class StrategyBase implements IStrategy {
    protected buffer: PriceTicker[];
    protected bufSize: number;
    constructor(bufSize?: number);
    createBuffer(maxSize: number): void;
    clearBuffer(): void;
    bufferCount(): number;
    put(ticker: PriceTicker): boolean;
    abstract getPrice(): PriceTicker | undefined;
}
//# sourceMappingURL=strategyBase.d.ts.map