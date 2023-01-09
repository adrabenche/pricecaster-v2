/**
 * Pricecaster Service.
 *
 * Database access class.
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
import Database, { RunResult } from 'better-sqlite3'
import * as Logger from '@randlabs/js-logger'
import { SlotInfo } from '../common/basetypes'

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
  private prepareAndExec (sql: string) {
    const stmt = this.db.prepare(sql)
    const info = stmt.run()
    Logger.info('Executed. Info: ' + JSON.stringify(info))
  }

  dropSlotLayoutTable () {
    Logger.info('Dropping SlotLayout table')
    this.prepareAndExec('DROP TABLE IF EXISTS SlotLayout;')
  }

  createSlotLayoutTable () {
    Logger.info('Creating new SlotLayout table')
    this.prepareAndExec('CREATE TABLE SlotLayout ( Slot INTEGER, PriceId TEXT(64), AsaId INTEGER, ' +
      'CONSTRAINT SlotLayout_PK PRIMARY KEY (Slot,PriceId, AsaId));')
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
}
