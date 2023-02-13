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

import { Gauge, Metric } from 'prom-client'
import { collect } from 'underscore'
import { IAppSettings } from '../common/settings'
import { PricecasterDatabase } from './Database'

export type TxStats = {
  error: number,
  success: number,
  avgCycleTime: number,
  lastCycleTime: number,
  fees: number,
  cost: number,
}

export class Statistics {
  constructor (readonly settings: IAppSettings, readonly pcDatabase: PricecasterDatabase) {
    if (process.env.RESETSTATS === '1') {
      pcDatabase.dropStatsLayoutTable()
      pcDatabase.createStatsTable()
    }
  }

  resetStats () {
    this.pcDatabase.resetStats()
  }

  increaseSuccessTxCount () {
    this.pcDatabase.incSuccessTxCount()
  }

  increaseFailedTxCount () {
    this.pcDatabase.incErrorTxCount()
  }

  getSuccessTxCount (): number {
    return this.pcDatabase.getSuccessTxCount()
  }

  getFailedTxCount (): number {
    return this.pcDatabase.getErrorTxCount()
  }

  getAvgCycleTime (): number {
    return this.pcDatabase.getAvgCycleTime()
  }

  getLastCycleTime (): number {
    return this.pcDatabase.getLastCycleTime()
  }

  setLastCycleTime (t: number) {
    this.pcDatabase.setLastCycleTime(t)
  }

  getTxStats (): TxStats {
    return this.pcDatabase.getStats()
  }
}
