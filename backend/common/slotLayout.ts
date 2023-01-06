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
import Database from 'better-sqlite3'

export class SlotLayout {
  private pclib: PricecasterLib
  private db: Database.Database
  constructor (readonly algodClient: algosdk.Algodv2, readonly ownerAccount: Account, readonly settings: IAppSettings) {
    this.pclib = new PricecasterLib(algodClient, this.ownerAccount.addr)
    this.pclib.setAppId(PRICECASTER_CI, this.settings.apps.pricecasterAppId)
    const dbFullName = this.settings.storage.db + this.settings.network[0]
    Logger.info('Database full path ' + dbFullName)
    this.db = new Database(dbFullName)
  }

  async init () {
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
  }

  /**
   * Prepare and execute an SQL statement.
   * @param sql SQL Statement to execute
   */
  private prepareAndExec (sql: string) {
    const stmt = this.db.prepare(sql)
    const info = stmt.run()
    Logger.info('Executed. Info: ' + JSON.stringify(info))
  }

  /**
   * Zero all the contract slots, resetting the Pricecaster to initial state.
   */
  private async resetContractSlots () {
    try {
      const txParams = await this.algodClient.getTransactionParams().do()
      txParams.fee = 2000
      const tx = this.pclib.makeResetTx(this.ownerAccount.addr, txParams)
      const { txId } = await this.algodClient.sendRawTransaction(tx.signTxn(this.ownerAccount.sk)).do()
      await this.pclib.waitForTransactionResponse(txId)
      Logger.warn('Contract zeroed.')
    } catch (e: any) {
      Logger.error('Reset contract call failed. ' + e.toString())
    }
  }

  /**
   * Create slot layout table in the Pricecaster database
   */
  private createSlotLayoutTable (dropOldTable: boolean) {
    if (dropOldTable) {
      Logger.info('Dropping SlotLayout table')
      this.prepareAndExec('DROP TABLE IF EXISTS SlotLayout;')
    }

    Logger.info('Creating new SlotLayout table')
    this.prepareAndExec('CREATE TABLE SlotLayout ( Slot INTEGER, PriceId TEXT(64), AsaId INTEGER, ' +
      'CONSTRAINT SlotLayout_PK PRIMARY KEY (Slot,PriceId, AsaId));')
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
    const ids = []
    const stmt = this.db.prepare('SELECT PriceId FROM SlotLayout')
    for (const row of stmt.iterate()) {
      ids.push(row.PriceId)
    }
    return ids
  }

  /**
   * Get slot info by Price Id
   */
  getSlotByPriceId (id: string): SlotInfo | undefined {
    const stmt = this.db.prepare('SELECT Slot, AsaId FROM SlotLayout WHERE PriceId = ?')
    const row = stmt.get(id)
    return row
      ? {
          priceId: id,
          asaId: row.AsaId,
          slot: row.Slot
        }
      : undefined
  }

  /**
   * Allocates a new contract price slot and updates internal structure
   */
  private async allocSlot (asaId: number, priceId: string): Promise<number> {
    const txParams = await this.algodClient.getTransactionParams().do()
    let slotId = -1
    let txResponse
    try {
      const tx = this.pclib.makeAllocSlotTx(this.ownerAccount.addr, asaId, txParams)
      const { txId } = await this.algodClient.sendRawTransaction(tx.signTxn(this.ownerAccount.sk)).do()
      txResponse = await this.pclib.waitForTransactionResponse(txId)

      // Extract from log
      slotId = Number(txResponse.logs[0].readBigUInt64BE('ALLOC@'.length))
      const stmt = this.db.prepare('INSERT INTO SlotLayout (Slot, PriceId, AsaId) VALUES (?, ? ,?)')
      stmt.run(slotId, priceId, asaId)
    } catch (e: any) {
      Logger.error(e.toString())
    }

    return slotId
  }
}
