/**
 * Pricecaster Service.
 *
 * Statistics module class.
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

export type TxStats = {
  total: number,
  pending: number,
  error: number,
  success: number
}

export type CostStats = {
    fees: number,
    cost: number,
}

export class Statistics {
  constructor () {
    this.txStats = {
      total: 0,
      pending: 0,
      error: 0,
      success: 0
    }

    this.costStats = {
      fees: 0,
      cost: 0
    }
  }

  txStats: TxStats
  costStats: CostStats
}
