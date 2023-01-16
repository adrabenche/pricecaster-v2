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
import { PythPriceServiceFetcher } from '../fetcher/pythPriceServiceFetcher'

const readline = require('readline')
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function ask (questionText: string) {
  return new Promise((resolve) => {
    rl.question(questionText, (input: unknown) => resolve(input))
  })
}

async function askCriticalStep (s: string) {
  const answer = await ask(s + '\nType YES to continue, anything else to abort.')
  if (answer !== 'YES') {
    console.warn('Aborted by user.')
    process.exit(1)
  }
}
export class SlotLayout {
  private pclib: PricecasterLib
  private fetcher!: PythPriceServiceFetcher
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
        await askCriticalStep('\nThis will clear contract onchain state and database!')
        Logger.warn('Bootstrapping process starting')
        this.createSlotLayoutTable(true)
        await this.resetContractSlots()
        await this.bootstrapSlotLayout(bootstrapSlotLayoutInfo[this.settings.network])
      } else if (process.env.RESETDB === '1') {
        await askCriticalStep('\nThis will reset local database. Inconsistency with onchain contract may arise.')
        this.createSlotLayoutTable(true)
      } else if (process.env.RESETCONTRACT === '1') {
        await askCriticalStep('\nThis will clear contract onchain state. Inconsistency with local database may arise.')
        this.resetContractSlots()
      }

      if (!this.settings.debug?.skipConsistencyCheck) {
        if (!await this.preflightConsistencyCheck()) {
          Logger.error('Consistency check failed. ')
          ok = false
        } else {
          Logger.info('Good, Pricecaster onchain and database slot layouts consistent.')
        }
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
    if (!layout) {
      throw new Error(`There is no slot layout available for network '${this.settings.network}'`)
    }
    for (const e of layout) {
      const slotId = await this.allocSlot(e.asaId, e.priceId)
      Logger.info(`Added slot ${slotId} for ASA ID: ${e.asaId}, PriceId: ${e.priceId}`)
    }
    Logger.info('Bootstrapped slot layout')
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
   * Get database slot count
   */
  getDatabaseSlotCount (): number {
    return this.pcDatabase.getSlotLayoutRowCount()
  }

  /**
   * Get onchain Pricecaster slot count
   */
  async getPricecasterSlotcount (): Promise<number> {
    const sysSlot = await this.pclib.readSystemSlot()
    return sysSlot.entryCount
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

  /**
   * Set active publisher
   */
  setPublisher (fetcher: PythPriceServiceFetcher) {
    this.fetcher = fetcher
  }
}
