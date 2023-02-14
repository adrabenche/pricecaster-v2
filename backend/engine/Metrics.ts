/**
 * Pricecaster Service.
 *
 * Copyright 2022, 2023 - C3.
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

import { Gauge, Metric } from 'prom-client'
import { Statistics } from './Stats'

export function getMetrics (stats: Statistics): Metric[] {
  return [
    new Gauge(
      {
        name: 'pricecaster_cycle_time',
        help: 'The time elapsed for the last cycle of publishing the entire set of prices.',
        collect () {
          this.set(stats.getLastCycleTime())
        }
      }
    ),
    new Gauge(
      {
        name: 'pricecaster_success_tx_count',
        help: 'The number of successful Algorand transaction groups issued (one for each VAA).',
        collect () {
          this.set(stats.getSuccessTxCount())
        }
      }
    ),
    new Gauge(
      {
        name: 'pricecaster_failed_tx_count',
        help: 'The number of failed Algorand transaction groups',
        collect () {
          this.set(stats.getFailedTxCount())
        }
      }
    ),
    new Gauge(
      {
        name: 'pricecaster_total_fees',
        help: 'The total consumed fees',
        collect () {
          this.set(0)/* stats.getTxStats().fees */
        }
      }
    )

  ]
}
