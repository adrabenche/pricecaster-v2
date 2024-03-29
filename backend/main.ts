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

// import * as Config from '@randlabs/js-config-reader'
import { getWormholeBridgeAppId, getWormholeCoreAppId, IAppSettings, loadFromEnvironment } from './common/settings'
import { exit } from 'process'
import { WormholeClientEngine } from './engine/WormholeEngine'
import * as Logger from '@randlabs/js-logger'
import { PC_COPYRIGHT, PC_VERSION } from './common/version'

(async () => {
  console.log(`Pricecaster Service Backend  Version ${PC_VERSION} -- ${PC_COPYRIGHT}\n`)

  let settings: IAppSettings
  try {
    settings = loadFromEnvironment()
    await Logger.initialize(settings.log)

    Logger.info('Loaded settings. ')
    Logger.info(`Using network: ${settings.network}`)
    Logger.info(`Algorand Client: API: ${settings.algo.api} Port: ${settings.algo.port}`)
    Logger.info(`Wormhole Appids: Core ${getWormholeCoreAppId(settings)}  Bridge ${getWormholeBridgeAppId(settings)} `)
    Logger.info(`Pricecaster Appid: ${settings.apps.pricecasterAppId}`)
  } catch (e: any) {
    console.error('Cannot initialize configuration: ' + e.toString())
    exit(1)
  }

  const engine = new WormholeClientEngine(settings)
  await engine.start()
})()
