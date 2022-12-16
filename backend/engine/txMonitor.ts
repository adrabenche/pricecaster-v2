/**
 * Pricecaster Service.
 *
 * TX Monitor class.
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

import { Algodv2 } from 'algosdk'
import { IAppSettings } from '../common/settings'
import * as Logger from '@randlabs/js-logger'

export type TxStats = {
  total: number,
  pending: number,
  error: number,
  success: number
}

export type UpdateResult = {
  confirmed: string[],
  failed: string[]
}

export class TxMonitor {
  // do with persistence (SQLite?)
  private pendingTxs: Set<string> = new Set()
  private stats: TxStats
  private timerId: any

  constructor (readonly settings: IAppSettings, readonly algodClient: Algodv2) {
    this.stats = { total: 0, pending: 0, error: 0, success: 0 }
  }

  start () {
    this.timerId = setInterval(async () => {
      const updateResult = await this.update()
      Logger.debug(1, `TxMonitor update: Confirmed TXs [${updateResult.confirmed}]`)
      if (updateResult.failed.length > 0) {
        Logger.debug(1, `TxMonitor update: Failed TXs [${updateResult.confirmed}]`)
      }
    }, this.settings.txMonitor.updateIntervalMs)
  }

  stop () {
    clearInterval(this.timerId)
  }

  addPendingTx (txId: string) {
    this.pendingTxs.add(txId)
    this.stats.pending++
  }

  async update (): Promise<UpdateResult> {
    const confirmed = []
    const failed = []
    for await (const txid of this.pendingTxs) {
      try {
        const info = await this.algodClient.pendingTransactionInformation(txid).do()
        if (info['pool-error'] === '') {
          if (info['confirmed-round'] >= this.settings.txMonitor.confirmationThreshold) {
            confirmed.push(txid)
          }
        } else {
          failed.push(txid)
        }
      } catch (e: any) {
        Logger.warn(`TxMonitor: ${txid} not yet in pool, round or unknown state`)
      }
    }

    confirmed.forEach((txid) => this.pendingTxs.delete(txid))
    failed.forEach((txid) => this.pendingTxs.delete(txid))
    this.stats.success += confirmed.length
    this.stats.error += failed.length
    this.stats.pending -= confirmed.length + failed.length

    return { confirmed, failed }
  }

  queryStats () {
    return this.stats
  }
}
