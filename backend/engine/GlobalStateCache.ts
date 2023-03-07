/**
 * Pricecaster Service.
 *
 * Slot Cache Component.
 *
 * Copyright 2022, 2023 Randlabs Inc.
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

import PricecasterLib, { PRICECASTER_CI, PriceSlotData } from '../../lib/pricecaster'
import algosdk, { Account } from 'algosdk'
import * as Logger from '@randlabs/js-logger'

export class GlobalStateCache {
  private lastRound: number
  private running: boolean = false
  private cached: PriceSlotData[] | undefined
  private pclib: PricecasterLib
  constructor (readonly algodClient: algosdk.Algodv2, owner: Account, readonly appId: number) {
    this.lastRound = 0
    this.pclib = new PricecasterLib(algodClient, owner.addr)
    this.pclib.setAppId(PRICECASTER_CI, appId)
  }

  public start () {
    this.running = true
    setImmediate(() => this.updateCacheLoop())
  }

  public stop () {
    Logger.info('Stopping cache...')
    this.running = false
  }

  private async updateCacheLoop () {
    if (this.running) {
      try {
        this.lastRound = (await this.algodClient.status().do())['last-round']
        await this.algodClient.statusAfterBlock(this.lastRound + 1).do()
        this.lastRound++
        if (await this.update()) {
          Logger.info('GlobalStateCache: updated state for round: ' + this.lastRound)
        }
        setImmediate(() => this.updateCacheLoop())
      } catch (e) {
        Logger.error('GlobalStateCache: updateCacheLoop: error: ' + e)
        setImmediate(() => this.updateCacheLoop())
      }
    }
  }

  public async update (): Promise<boolean> {
    if (this.running) {
      this.cached = await this.pclib.readParseGlobalState()
      return true
    }

    return false
  }

  public read () {
    return this.cached
  }
}
