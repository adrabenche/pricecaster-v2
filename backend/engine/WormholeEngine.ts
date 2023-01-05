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
import { Algodv2 } from 'algosdk'
import { IPublisher } from '../publisher/IPublisher'
import { Statistics } from './Stats'
const fs = require('fs')
const algosdk = require('algosdk')

export class WormholeClientEngine implements IEngine {
  private fetcher!: PythPriceServiceFetcher
  private publisher!: IPublisher
  private stats!: Statistics
  private settings: IAppSettings
  private shouldQuit: boolean
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
    }
  }

  async start () {
    process.on('SIGINT', async () => {
      await this.shutdown()
    })

    const algodClient = new Algodv2(this.settings.algo.token, this.settings.algo.api, this.settings.algo.port)
    let mnemo
    try {
      mnemo = fs.readFileSync(this.settings.apps.ownerKeyFile)
    } catch (e) {
      throw new Error('❌ Cannot read account key file: ' + e)
    }

    Logger.info('Starting statistics module...')
    this.stats = new Statistics()

    if (this.settings.debug?.skipPublish) {
      Logger.warn('Using Null Publisher')
      this.publisher = new NullPublisher()
    } else {
      this.publisher = new C3Publisher(algodClient, algosdk.mnemonicToSecretKey((mnemo.toString()).trim()), this.stats, this.settings)
    }
    this.fetcher = new PythPriceServiceFetcher(this.settings, this.stats)

    Logger.info('Waiting for publisher to boot...')
    this.publisher.start()

    Logger.info('Waiting for fetcher to boot...')
    this.fetcher.setDataReadyCallback(this.publisher.publish.bind(this.publisher))
    this.fetcher.start()

    Logger.info('Ready.')
  }
}
