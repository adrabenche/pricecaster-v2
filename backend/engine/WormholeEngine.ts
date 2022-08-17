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
import { Pricekeeper2Publisher as PricecasterPublisher } from '../publisher/Pricekeeper2Publisher'
import * as Logger from '@randlabs/js-logger'
import { sleep } from '../common/sleep'
import { PythSymbolInfo } from './SymbolInfo'
import { Pyth2AsaMapper } from '../mapper/Pyth2AsaMapper'
import { NullPublisher } from '../publisher/NullPublisher'
import { Algodv2 } from 'algosdk'
const fs = require('fs')
const algosdk = require('algosdk')

export class WormholeClientEngine implements IEngine {
  private settings: IAppSettings
  private shouldQuit: boolean
  constructor (settings: IAppSettings) {
    this.settings = settings
    this.shouldQuit = false
  }

  async start () {
    process.on('SIGINT', () => {
      Logger.warn('Received SIGINT')
      this.shouldQuit = true
    })

    let mnemo
    try {
      mnemo = fs.readFileSync(this.settings.apps.ownerKeyFile)
    } catch (e) {
      throw new Error('❌ Cannot read account key file: ' + e)
    }

    let publisher

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
      publisher = new NullPublisher()
    } else {
      publisher = new PricecasterPublisher(this.settings.apps.wormholeCoreAppId,
        this.settings.apps.pricecasterAppId,
        algosdk.mnemonicToSecretKey(mnemo.toString()),
        new Algodv2(this.settings.algo.token, this.settings.algo.api, this.settings.algo.port),
        this.settings.algo.dumpFailedTx,
        this.settings.algo.dumpFailedTxDirectory
      )
    }
    const fetcher = new WormholePythPriceFetcher(this.settings.wormhole.spyServiceHost,
      this.settings.pyth.chainId,
      this.settings.pyth.emitterAddress,
      symbolInfo,
      mapper,
      publisher)

    Logger.info('Waiting for publisher to boot...')
    await publisher.start()

    Logger.info('Waiting for fetcher to boot...')
    await fetcher.start()

    Logger.info('Ready.')

    while (!this.shouldQuit) {
      await sleep(1000)
    }

    fetcher.stop()
    publisher.stop()
    Logger.finalize()
  }
}
