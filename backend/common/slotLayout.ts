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
import { bootstrapSlotLayoutInfo } from '../../settings/bootSlotLayout'
import { PricecasterDatabase } from '../engine/Database'

export class SlotLayout {
  private pclib: PricecasterLib
  constructor (readonly algodClient: algosdk.Algodv2,
      readonly ownerAccount: Account,
      readonly settings: IAppSettings,
      readonly pcDatabase: PricecasterDatabase) {
    this.pclib = new PricecasterLib(algodClient, this.ownerAccount.addr)
    this.pclib.setAppId(PRICECASTER_CI, this.settings.apps.pricecasterAppId)
  }

  async init (): Promise<boolean> {
    let ok = true
    try {
      if (process.env.BOOTSTRAPDB === '1') {
        Logger.warn('Bootstrapping process starting')
        this.createSlotLayoutTable(true)
        await this.resetContractSlots()
        await this.bootstrapSlotLayout(bootstrapSlotLayoutInfo[this.settings.network])
      } else if (process.env.RESETDB === '1') {
        this.createSlotLayoutTable(true)
      } else if (process.env.RESETCONTRACT === '1') {
        this.resetContractSlots()
      }

      if (!await this.preflightConsistencyCheck()) {
        Logger.error('Consistency check failed. ')
        ok = false
      } else {
        Logger.info('Good, Pricecaster onchain and database slot layouts consistent.')
      }
    } catch (e: any) {
      Logger.error('Initialization failed: ' + e.toString())
      ok = false
    }

    return ok
  }

  /**
   * Zero all the contract slots, resetting the Pricecaster to initial state.
   */
  private async resetContractSlots () {
    Logger.warn('Resetting contract.')
    const txParams = await this.algodClient.getTransactionParams().do()
    txParams.fee = 2000
    const tx = this.pclib.makeResetTx(this.ownerAccount.addr, txParams)
    const { txId } = await this.algodClient.sendRawTransaction(tx.signTxn(this.ownerAccount.sk)).do()
    await this.pclib.waitForTransactionResponse(txId)
    Logger.warn('Contract zeroed.')
  }

  /**
   * Create slot layout table in the Pricecaster database
   */
  private createSlotLayoutTable (dropOldTable: boolean) {
    if (dropOldTable) {
      this.pcDatabase.dropSlotLayoutTable()
    }
    this.pcDatabase.createSlotLayoutTable()
  }

  /**
   * Build the layout table from prepared bootstraping info
   */
  private async bootstrapSlotLayout (layout: SlotInfo[]) {
    Logger.info('Bootstrapped slot layout')

    for (const e of layout) {
      const slotId = await this.allocSlot(e.asaId, e.priceId)
      Logger.info(`Added slot ${slotId} for ASA ID: ${e.asaId}, PriceId: ${e.priceId}`)
    }
  }

  /**
   * Dump stored layout log
   */
  dumpSlotLayout () {
    // this.layout.forEach((e) => Logger.info(`slot ${e.index}, ASA ID: ${e.asaId}, PriceId: ${e.priceId}`))
  }

  /*
   * Get available price Ids
   */
  getPriceIds (): string[] {
    return this.pcDatabase.getPriceIds()
  }

  /**
   * Get slot info by Price Id
   */
  getSlotByPriceId (id: string): SlotInfo | undefined {
    return this.pcDatabase.getSlotByPriceId(id)
  }

  /**
   * Allocates a new contract price slot and updates internal structure
   */
  async allocSlot (asaId: number, priceId: string): Promise<number> {
    const txParams = await this.algodClient.getTransactionParams().do()
    const tx = this.pclib.makeAllocSlotTx(this.ownerAccount.addr, asaId, txParams)
    const { txId } = await this.algodClient.sendRawTransaction(tx.signTxn(this.ownerAccount.sk)).do()
    const txResponse = await this.pclib.waitForTransactionResponse(txId)

    // Extract from log
    const slotId = Number(txResponse.logs[0].readBigUInt64BE('ALLOC@'.length))
    this.pcDatabase.addSlotLayoutEntry(slotId, priceId, asaId)
    return slotId
  }

  /**
   * Ensures that the database and contract slot layouts are consistent.
   */
  private async preflightConsistencyCheck (): Promise<boolean> {
    Logger.info('Pre-flight consistency check running')
    const sysSlot = await this.pclib.readSystemSlot()
    const rowCount = this.pcDatabase.getSlotLayoutRowCount()
    Logger.info(`Pricecaster onchain entry count: ${sysSlot.entryCount}, database count: ${rowCount}`)

    if (rowCount !== sysSlot.entryCount) {
      return false
    }

    for (const row of this.pcDatabase.getSlotLayoutRowIterator()) {
      const slotdata = await this.pclib.readParsePriceSlot(row.Slot)
      Logger.info(`Pricecaster slot ${row.Slot} ASA: ${slotdata.asaId}, database ${row.AsaId}`)
      if (slotdata.asaId !== row.AsaId) {
        return false
      }
    }
    return true
  }
}
