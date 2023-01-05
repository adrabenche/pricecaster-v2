/**
 * Pricecaster Service.
 *
 * Slot layout class.
 *
 * Copyright 2022, 23 Randlabs Inc.
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

import { IAppSettings } from './settings'
import PricecasterLib, { PRICECASTER_CI } from '../../lib/pricecaster'
import algosdk, { Account } from 'algosdk'
import { SlotInfo } from './basetypes'
import * as Logger from '@randlabs/js-logger'
import { BootstrapSlotLayout } from '../../settings/bootSlotLayout'

export class SlotLayout {
  private layout: SlotInfo[] = []
  private pclib: PricecasterLib
  constructor (algodClient: algosdk.Algodv2, ownerAccount: Account, readonly settings: IAppSettings) {
    this.pclib = new PricecasterLib(algodClient, ownerAccount.addr)
    this.pclib.setAppId(PRICECASTER_CI, this.settings.apps.pricecasterAppId)
  }

  /**
   * Build the internal layout structure from prepared bootstraping info
   */
  bootstrapSlotLayout (bootstrapSlotLayout: BootstrapSlotLayout) {
    this.layout = bootstrapSlotLayout[this.settings.network]
    Logger.info('Bootstrapped slot layout')
  }

  /**
   * Dump stored layout log
   */
  dumpSlotLayout () {
    this.layout.forEach((e) => Logger.info(`slot ${e.index}, ASA ID: ${e.asaId}, PriceId: ${e.priceId}`))
  }

  /*
   * Get available price Ids
   */
  getPriceIds (): string[] {
    return this.layout.map((v: SlotInfo) => v.priceId)
  }

  /**
   * Get slot info by Price Id
   */
  getSlotByPriceId (id: string): SlotInfo | undefined {
    return this.layout.find((v: SlotInfo) => v.priceId === id)
  }
}
