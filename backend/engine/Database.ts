/**
 * Pricecaster Service.
 *
 * Database access class.
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

import { IAppSettings } from '../common/settings'
import Database, { RunResult } from 'better-sqlite3'
import * as Logger from '@randlabs/js-logger'
import { SlotInfo } from '../common/basetypes'
import { TxStats } from './Stats'

export class PricecasterDatabase {
  private db: Database.Database

  constructor (readonly settings: IAppSettings) {
    const dbFullName = this.settings.storage.db + this.settings.network[0]
    Logger.info('Database full path ' + dbFullName)
    this.db = new Database(dbFullName)
  }

  /**
  * Prepare and execute an SQL statement.
  * @param sql SQL Statement to execute
  */
  private prepareAndExec (sql: string, args: any[] = []) {
    const stmt = this.db.prepare(sql)
    const info = stmt.run(...args)
    Logger.info('Executed. Info: ' + JSON.stringify(info))
  }

  dropSlotLayoutTable () {
    Logger.info('Dropping SlotLayout table')
    this.prepareAndExec('DROP TABLE IF EXISTS SlotLayout;')
  }

  dropStatsLayoutTable () {
    Logger.info('Dropping Statistics table')
    this.prepareAndExec('DROP TABLE IF EXISTS Stats;')
  }

  createSlotLayoutTable () {
    Logger.info('Creating new SlotLayout table')
    this.prepareAndExec('CREATE TABLE SlotLayout ( Slot INTEGER, PriceId TEXT(64), AsaId INTEGER, ' +
      'CONSTRAINT SlotLayout_PK PRIMARY KEY (Slot,PriceId, AsaId));')
  }

  createStatsTable () {
    Logger.info('Creating new Stats table')
    this.prepareAndExec('CREATE TABLE Stats ( Id INTEGER, Success REAL, Failed REAL, AvgCycleTime REAL, AvgFees REAL, AvgCost REAL' +
      'CONSTRAINT PRIMARY KEY CHECK (Id = 0));')
    this.prepareAndExec('INSERT INTO Stats (Id, Success, Failed, AvgCycleTime, AvgFees, AvgCost) VALUES (0, 0, 0, 0.0, 0.0, 0.0);')
  }

  updateStats (s: TxStats) {
    this.prepareAndExec('UPDATE Stats SET Success = ?, Failed = ?, AvgCycleTime = ?, AvgFees = ?, AvgCost = ? WHERE Id = 0',
      [s.success, s.error, s.avgCycleTime, s.fees, s.cost])
  }

  getPriceIds (): string[] {
    const ids = []
    const stmt = this.db.prepare('SELECT PriceId FROM SlotLayout')
    for (const row of stmt.iterate()) {
      ids.push(row.PriceId)
    }
    return ids
  }

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

  addSlotLayoutEntry (slotId: number, priceId: string, asaId: number): RunResult {
    const stmt = this.db.prepare('INSERT INTO SlotLayout (Slot, PriceId, AsaId) VALUES (?, ? ,?)')
    return stmt.run(slotId, priceId, asaId)
  }

  getSlotLayoutRowCount (): number {
    const stmt = this.db.prepare('SELECT COUNT(*) FROM SlotLayout')
    const rowCount = stmt.get()['COUNT(*)']
    return rowCount
  }

  getSlotLayoutRowIterator (): IterableIterator<any> {
    const stmt = this.db.prepare('SELECT * FROM SlotLayout')
    return stmt.iterate()
  }

  getSuccessTxCount (): number {
    return this.db.prepare('SELECT Success FROM Stats').get().Success
  }

  getStats (): TxStats {
    const stmt = this.db.prepare('SELECT * FROM Stats')
    const row = stmt.get()

    return {
      error: row.Failed,
      success: row.Success,
      avgCycleTime: row.AvgCycleTime,
      fees: row.AvgFees,
      cost: row.Cost
    }
  }

  getAvgCycleTime (): number {
    return this.db.prepare('SELECT AvgCycleTime FROM Stats').get().AvgCycleTime
  }

  getErrorTxCount (): number {
    return this.db.prepare('SELECT Failed FROM Stats').get().Failed
  }

  incErrorTxCount () {
    (this.db.prepare('UPDATE Stats SET Failed = Failed + 1 WHERE id = 0')).run()
  }

  incSuccessTxCount () {
    (this.db.prepare('UPDATE Stats SET Success = Success + 1 WHERE id = 0')).run()
  }

  resetStats () {
    (this.db.prepare('UPDATE Stats SET Success = 0, Failed = 0, AvgCycleTime = 0.0, AvgFees = 0.0, AvgCost = 0.0 WHERE id = 0')).run()
  }
}
