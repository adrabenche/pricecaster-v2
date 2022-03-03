import { IStrategy } from '../strategy/strategy';
export interface IPriceFetcher {
    start(): void;
    stop(): void;
    hasData(): boolean;
    setStrategy(s: IStrategy): void;
    queryData(id?: string): any | undefined;
}
//# sourceMappingURL=IPriceFetcher.d.ts.map