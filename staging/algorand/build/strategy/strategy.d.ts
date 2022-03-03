import { PriceTicker } from '../common/priceTicker';
export interface IStrategy {
    createBuffer(size: number): void;
    clearBuffer(): void;
    bufferCount(): number;
    put(ticker: PriceTicker): boolean;
    getPrice(): PriceTicker | undefined;
}
//# sourceMappingURL=strategy.d.ts.map