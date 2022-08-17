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
import { WormholePythPriceFetcher } from '../fetcher/WormholePythPriceFetcher'
import { PricecasterPublisher } from '../publisher/Pricekeeper2Publisher'
import * as Logger from '@randlabs/js-logger'
import { sleep } from '../common/sleep'
import { PythSymbolInfo } from './SymbolInfo'
import { Pyth2AsaMapper } from '../mapper/Pyth2AsaMapper'
import { NullPublisher } from '../publisher/NullPublisher'
import { Algodv2 } from 'algosdk'
import { IPublisher } from 'backend/publisher/IPublisher'
import { IPriceFetcher } from 'backend/fetcher/IPriceFetcher'
const fs = require('fs')
const algosdk = require('algosdk')

export class WormholeClientEngine implements IEngine {
  private publisher!: IPublisher
  private fetcher!: IPriceFetcher
  private settings: IAppSettings
  private shouldQuit: boolean
  constructor (settings: IAppSettings) {
    this.settings = settings
    this.shouldQuit = false
  }

  async shutdown () {
    if (!this.shouldQuit) {
      Logger.warn('Received SIGINT')
      this.fetcher.stop()
      this.publisher.stop()
      await Logger.finalize()
      this.shouldQuit = true
    }
  }

  async start () {
    process.on('SIGINT', async () => {
      process.off('SIGINT', this.shutdown)
      await this.shutdown()
    })

    let mnemo
    try {
      mnemo = fs.readFileSync(this.settings.apps.ownerKeyFile)
    } catch (e) {
      throw new Error('❌ Cannot read account key file: ' + e)
    }

    Logger.info(`Gathering prices from Pyth network ${this.settings.symbols.sourceNetwork}...`)
    const symbolInfo = new PythSymbolInfo(this.settings.symbols.sourceNetwork)
    await symbolInfo.load()
    Logger.info(`Loaded ${symbolInfo.getSymbolCount()} product(s)`)

    const mapper = new Pyth2AsaMapper(this.settings.apps.asaIdMapperAppId,
      algosdk.mnemonicToSecretKey(mnemo.toString()),
      this.settings.algo.token,
      this.settings.algo.api,
      this.settings.algo.port,
      this.settings.apps.asaIdMapperDataNetwork,
      symbolInfo)

    if (this.settings.debug?.skipPublish) {
      Logger.warn('Using Null Publisher')
      this.publisher = new NullPublisher()
    } else {
      this.publisher = new PricecasterPublisher(this.settings.apps.wormholeCoreAppId,
        this.settings.apps.pricecasterAppId,
        algosdk.mnemonicToSecretKey(mnemo.toString()),
        new Algodv2(this.settings.algo.token, this.settings.algo.api, this.settings.algo.port),
        this.settings.algo.dumpFailedTx,
        this.settings.algo.dumpFailedTxDirectory
      )
    }
    this.fetcher = new WormholePythPriceFetcher(this.settings.wormhole.spyServiceHost,
      this.settings.pyth.chainId,
      this.settings.pyth.emitterAddress,
      symbolInfo,
      mapper,
      this.publisher)

    Logger.info('Waiting for publisher to boot...')
    this.publisher.start()

    Logger.info('Waiting for fetcher to boot...')
    this.fetcher.start()

    Logger.info('Ready.')

    while (!this.shouldQuit) {
      await sleep(1000)
    }
  }
}
