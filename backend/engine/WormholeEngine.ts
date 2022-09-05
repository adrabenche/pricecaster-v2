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
import { getPythFilter, getWormholeCoreAppId, IAppSettings } from '../common/settings'
import { WormholePythPriceFetcher } from '../fetcher/WormholePythPriceFetcher'
import { PricecasterPublisher } from '../publisher/Pricekeeper2Publisher'
import * as Logger from '@randlabs/js-logger'
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
      this.shouldQuit = true
      Logger.warn('Received SIGINT')
      this.fetcher.shutdown()
      this.publisher.stop()
      await Logger.finalize()
    }
  }

  async start () {
    process.on('SIGINT', async () => {
      await this.shutdown()
    })

    let mnemo
    try {
      mnemo = fs.readFileSync(this.settings.apps.ownerKeyFile)
    } catch (e) {
      throw new Error('❌ Cannot read account key file: ' + e)
    }

    const NetworkToCluster = (network: 'testnet' | 'mainnet') => { return network === 'mainnet' ? 'mainnet-beta' : 'testnet' }
    Logger.info(`Gathering prices from Pyth network ${NetworkToCluster(this.settings.network)}...`)
    const symbolInfo = new PythSymbolInfo(NetworkToCluster(this.settings.network))
    await symbolInfo.load()
    Logger.info(`Loaded ${symbolInfo.getSymbolCount()} product(s)`)

    const mapper = new Pyth2AsaMapper(this.settings.network)

    if (this.settings.debug?.skipPublish) {
      Logger.warn('Using Null Publisher')
      this.publisher = new NullPublisher()
    } else {
      this.publisher = new PricecasterPublisher(BigInt(getWormholeCoreAppId(this.settings)),
        this.settings.apps.pricecasterAppId,
        algosdk.mnemonicToSecretKey(mnemo.toString()),
        new Algodv2(this.settings.algo.token, this.settings.algo.api, this.settings.algo.port),
        this.settings.algo.dumpFailedTx,
        this.settings.algo.dumpFailedTxDirectory
      )
    }
    this.fetcher = new WormholePythPriceFetcher(
      getPythFilter(this.settings),
      this.settings.wormhole.spyServiceHost,
      symbolInfo,
      mapper,
      this.publisher)

    Logger.info('Waiting for publisher to boot...')
    this.publisher.start()

    Logger.info('Waiting for fetcher to boot...')
    this.fetcher.start()

    Logger.info('Ready.')
  }
}
