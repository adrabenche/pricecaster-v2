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

import { IEngine } from './IEngine'
import { IAppSettings } from '../common/settings'
import { PythPriceServiceFetcher } from '../fetcher/pythPriceServiceFetcher'
import { PricecasterPublisher as C3Publisher } from '../publisher/C3Publisher'
import * as Logger from '@randlabs/js-logger'
import { NullPublisher } from '../publisher/NullPublisher'
import algosdk, { Algodv2 } from 'algosdk'
import { IPublisher } from '../publisher/IPublisher'
import { Statistics } from './Stats'
import { SlotLayout } from '../common/slotLayout'
import { RestApi } from './RestApi'
import { PricecasterDatabase } from './Database'
import { PromClientApi } from './PromClient'
const fs = require('fs')

export type EngineSwitch = {
  publishEnable: boolean,
  refreshPriceIdLatch: boolean
}

export class WormholeClientEngine implements IEngine {
  private fetcher!: PythPriceServiceFetcher
  private publisher!: IPublisher
  private stats!: Statistics
  private settings: IAppSettings
  private slotLayout!: SlotLayout
  private shouldQuit: boolean
  private restApi!: RestApi
  private promApi!: PromClientApi
  private engineSwitch: EngineSwitch = {
    publishEnable: false,
    refreshPriceIdLatch: true
  }

  constructor (settings: IAppSettings) {
    this.settings = settings
    this.shouldQuit = false
  }

  async shutdown () {
    if (!this.shouldQuit) {
      this.shouldQuit = true
      Logger.warn('Received SIGINT')
      this.publisher.stop()
      this.fetcher.shutdown()
      await Logger.finalize()
      this.restApi.stop()
      this.promApi.stop()
    }
  }

  async start () {
    process.on('SIGINT', async () => {
      await this.shutdown()
    })

    const db = new PricecasterDatabase(this.settings)

    const algodClient = new Algodv2(this.settings.algo.token, this.settings.algo.api, this.settings.algo.port)
    let ownerAccount: algosdk.Account
    try {
      ownerAccount = algosdk.mnemonicToSecretKey(this.settings.apps.ownerMnemonic.trim())
    } catch (e) {
      throw new Error('❌ Cannot get owner address: ' + e)
    }

    this.slotLayout = new SlotLayout(algodClient, ownerAccount, this.settings, db)

    const initResult = await this.slotLayout.init()

    Logger.info('Starting statistics module...')
    this.stats = new Statistics(this.settings, db)

    // When bootstrapping, bail out
    if (!initResult || process.env.BOOTSTRAPDB === '1') {
      Logger.info('Bailing out, bye')
      process.exit(0)
    }

    Logger.info('Starting Rest API module...')
    this.restApi = new RestApi(this.settings, this.slotLayout, this.stats)
    await this.restApi.init()

    Logger.info('Starting Prometheus API module...')
    this.promApi = new PromClientApi(this.settings, this.stats)
    await this.promApi.init()

    if (this.settings.debug?.skipPublish) {
      Logger.warn('Using Null Publisher')
      this.publisher = new NullPublisher()
    } else {
      this.publisher = new C3Publisher(algodClient, ownerAccount, this.stats, this.settings, this.slotLayout)
    }
    this.fetcher = new PythPriceServiceFetcher(this.settings, this.stats, this.slotLayout)

    Logger.info('Waiting for publisher to boot...')
    this.publisher.start()

    Logger.info('Waiting for fetcher to boot...')
    this.fetcher.setDataReadyCallback(this.publisher.publish.bind(this.publisher))
    this.fetcher.start()

    Logger.info('Ready.')
  }
}
