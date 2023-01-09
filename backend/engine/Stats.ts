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

import { IAppSettings } from '../common/settings'

type TxStats = {
  error: number,
  success: number,
  avgCycleTime: number
  fees: number,
  cost: number,
}

export class Statistics {
  private txStats!: TxStats
  constructor (readonly settings: IAppSettings) {
    this.resetStats()
  }

  resetStats () {
    this.txStats = {
      error: 0,
      success: 0,
      avgCycleTime: 0,
      fees: 0,
      cost: 0
    }
  }

  increaseSuccessTxCount () {
    this.txStats.success++
  }

  increaseFailedTxCount () {
    this.txStats.error++
  }

  getSuccessTxCount (): number {
    return this.txStats.success
  }

  getFailedTxCount (): number {
    return this.txStats.error
  }

  getAvgCycleTime (): number {
    return this.getAvgCycleTime()
  }

  getTxStats (): TxStats {
    return this.txStats
  }
}
