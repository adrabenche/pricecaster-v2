/* eslint-disable camelcase */
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

import * as Logger from '@randlabs/js-logger'
import { getPriceIds, IAppSettings } from '../common/settings'
import { HexString } from '@pythnetwork/pyth-common-js'
import { PriceServiceConnection2 } from './priceServiceClient'
import { DataReadyCallback } from '../common/basetypes'
import _ from 'underscore'

export class PythPriceServiceFetcher {
  private priceServiceConnection: PriceServiceConnection2
  private active: boolean = false
  private allIds: HexString[] = []
  private dataReadyCallback: DataReadyCallback = async (v: Buffer[]) => {}

  constructor (readonly settings: IAppSettings) {
    this.priceServiceConnection = new PriceServiceConnection2(this.settings.pyth.priceService[this.settings.network],
      this.settings.pyth.priceServiceConfiguration)
  }

  async setDataReadyCallback (drcb: DataReadyCallback) {
    this.dataReadyCallback = drcb
  }

  async getVaas () {
    //
    // Several prices may be present on the same VAAs, so returned number of VAAs wont necessarily
    // match 1:1 to requested Ids.
    //
    // We cant request a lot of IDs in one block without being kicked by Cloudflare, so we divide the
    // requested IDs in blocks.
    //

    const t0 = _.now()

    const priceIdBlocks = _.chunk(getPriceIds(this.settings), this.settings.pyth.priceService.requestBlockSize)
    const vaaList = []
    for await (const block of priceIdBlocks) {
      try {
        Logger.debug(1, 'Calling request block...')
        const vaas = await this.priceServiceConnection.getLatestVaasForIds(block)
        vaaList.push(vaas)
      } catch (e: any) {
        Logger.error(`Error getting priceId block ${block}, reason ${e.toString()}`)
      }
    }
    await this.dataReadyCallback(vaaList.flat())

    const t1 = _.now() - t0
    Logger.debug(1, `Finished callback: ${vaaList.flat().length} VAAs, cycle time ${t1}ms`)

    if (this.active) {
      setTimeout(async () => { this.getVaas() }, this.settings.pyth.priceService.pollIntervalMs)
    }
  }

  async start () {
    this.active = true
    this.allIds = await this.priceServiceConnection.getPriceFeedIds()
    Logger.info(`Got ${this.allIds.length} PriceId(s) from Price Service`)
    setTimeout(async () => { this.getVaas() }, this.settings.pyth.priceService.pollIntervalMs)
  }

  stop (): void {
    Logger.info('Stopping fetcher...')
    this.active = false
  }

  shutdown (): void {
    this.stop()
  }
}
