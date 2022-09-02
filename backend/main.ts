/* eslint-disable func-call-spacing */
/* eslint-disable no-unused-vars */
/**
 * Pricecaster Service.
 *
 * Main program file.
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

import * as Config from '@randlabs/js-config-reader'
import { getPythChainId, getPythnetEmitterAddress, getWormholeBridgeAppId, getWormholeCoreAppId, IAppSettings } from './common/settings'
import { exit } from 'process'
import { WormholeClientEngine } from './engine/WormholeEngine'
import * as Logger from '@randlabs/js-logger'
import { CHAIN_ID_PYTHNET, CONTRACTS } from '@certusone/wormhole-sdk'
import { PC_COPYRIGHT, PC_VERSION } from './common/version'
const charm = require('charm')();

(async () => {
  charm.pipe(process.stdout)
  charm.reset()
  charm.foreground('cyan').display('bright')
  console.log(`Pricecaster Service Backend  Version ${PC_VERSION} -- ${PC_COPYRIGHT}\n`)
  charm.foreground('white')

  let settings: IAppSettings
  try {
    await Config.initialize<IAppSettings>({ envVar: 'PRICECASTER_SETTINGS' })
    settings = Config.get<IAppSettings>()
    await Logger.initialize(settings.log)

    Logger.info('Loaded settings. ')
    Logger.info(`Using network: ${settings.network}`)
    Logger.info(`Algorand Client: API: ${settings.algo.api} Port: ${settings.algo.port}`)
    Logger.info(`Wormhole Appids: Core ${getWormholeCoreAppId(settings)}  Bridge ${getWormholeBridgeAppId(settings)} `)
    Logger.info(`Pricecaster Appid: ${settings.apps.pricecasterAppId}`)
    Logger.info(`Pyth network. ChainId: ${getPythChainId()}  Emitter: ${getPythnetEmitterAddress(settings)}`)
  } catch (e: any) {
    console.error('Cannot initialize configuration: ' + e.toString())
    exit(1)
  }

  const engine = new WormholeClientEngine(settings)
  await engine.start()
})()
