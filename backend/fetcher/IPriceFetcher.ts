/**
 * Pricecaster Service.
 *
 * Fetcher backend component.
 *
 * Copyright 2022 Randlabs Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { IStrategy } from '../strategy/strategy'

export interface IPriceFetcher {
    start(): void
    stop(): void
    hasData(): boolean
    shutdown(): void

    /**
     * Set price aggregation strategy for this fetcher.
     * @param IStrategy The local price aggregation strategy
     */
    setStrategy(s: IStrategy): void

    /**
     * Get the current data.
     */
    queryData(id?: string): any | undefined
}
