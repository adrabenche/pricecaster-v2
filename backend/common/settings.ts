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

import { CONTRACTS } from '@certusone/wormhole-sdk'
import { Options } from '@randlabs/js-logger'

export type Filter = { 'chain_id': number, 'emitter_address': string }

export interface IAppSettings extends Record<string, unknown> {
  prom: {
    port: number
  },
  rest: {
    port: number
  },
  pyth: {
    priceService: {
      mainnet: string,
      testnet: string,
      devnet: string,
      pollIntervalMs: number,
      requestBlockSize: number
    },
    priceServiceConfiguration?: {
      timeout?: number,
      httpRetries?: number
      /*
      logger?: Logger;
      verbose?: boolean;
      */
    }
  }
  log: Options,
  algo: {
    token: string,
    api: string,
    port: string,
    dumpFailedTx: boolean,
    dumpFailedTxDirectory?: string,
    getNetworkTxParamsCycleInterval: number,
  },
  apps: {
    pricecasterAppId: number,
    ownerMnemonic: string
  },
  debug?: {
    skipPublish?: boolean,
    skipConsistencyCheck?: boolean
  },
  storage: {
    db: string
  },
  network: 'testnet' | 'mainnet' | 'devnet'
}

const netUpper = (settings: IAppSettings) => settings.network.toUpperCase() as 'MAINNET' | 'TESTNET' | 'DEVNET'

export function getWormholeCoreAppId (settings: IAppSettings) {
  return CONTRACTS[netUpper(settings)].algorand.core
}

export function getWormholeBridgeAppId (settings: IAppSettings) {
  return CONTRACTS[netUpper(settings)].algorand.token_bridge
}

export function loadFromEnvironment (): IAppSettings {
  const env = process.env

  if (env.PROM_PORT === undefined) {
    throw new Error('PROM_PORT is not defined')
  }

  if (env.REST_PORT === undefined) {
    throw new Error('REST_PORT is not defined')
  }

  if (env.PYTH_PRICESERVICE_MAINNET === undefined) {
    throw new Error('PYTH_PRICESERVICE_MAINNET is not defined')
  }

  if (env.PYTH_PRICESERVICE_TESTNET === undefined) {
    throw new Error('PYTH_PRICESERVICE_TESTNET is not defined')
  }

  if (env.PYTH_PRICESERVICE_DEVNET === undefined) {
    throw new Error('PYTH_PRICESERVICE_DEVNET is not defined')
  }

  if (env.PYTH_PRICESERVICE_POLL_INTERVAL_MS === undefined) {
    throw new Error('PYTH_PRICESERVICE_POLL_INTERVAL_MS is not defined')
  }

  if (Number(env.PYTH_PRICESERVICE_POLL_INTERVAL_MS) === 0) {
    throw new Error('PYTH_PRICESERVICE_POLL_INTERVAL_MS must be greater than 0')
  }

  if (env.PYTH_PRICESERVICE_REQUEST_BLOCKSIZE === undefined) {
    throw new Error('PYTH_PRICESERVICE_REQUEST_BLOCKSIZE is not defined')
  }

  if (Number(env.PYTH_PRICESERVICE_REQUEST_BLOCKSIZE) === 0) {
    throw new Error('PYTH_PRICESERVICE_REQUEST_BLOCKSIZE must be greater than 0')
  }

  if (env.LOG_APPNAME === undefined) {
    throw new Error('LOG_APPNAME is not defined')
  }

  if (env.ALGO_API === undefined) {
    throw new Error('ALGO_API is not defined')
  }

  if (env.ALGO_GET_NETWORK_TX_PARAMS_CYCLE_INTERVAL === undefined) {
    throw new Error('ALGO_GET_NETWORK_TX_PARAMS_CYCLE_INTERVAL is not defined')
  }

  if (Number(env.ALGO_GET_NETWORK_TX_PARAMS_CYCLE_INTERVAL) === 0) {
    throw new Error('ALGO_GET_NETWORK_TX_PARAMS_CYCLE_INTERVAL must be greater than 0')
  }

  if (env.APPS_PRICECASTER_APPID === undefined) {
    throw new Error('APPS_PRICECASTER_APPID is not defined')
  }

  if (env.APPS_OWNER_KEY_MNEMO === undefined) {
    throw new Error('APPS_OWNER_MNEMO is not defined')
  }

  if (env.STORAGE_DB === undefined) {
    throw new Error('STORAGE_DB is not defined')
  }

  if (env.NETWORK === undefined) {
    throw new Error('NETWORK is not defined')
  }

  if (env.NETWORK !== 'mainnet' && env.NETWORK !== 'testnet' && env.NETWORK !== 'devnet') {
    throw new Error('NETWORK must be one of mainnet, testnet, devnet')
  }

  return {
    prom: { port: Number(env.PROM_PORT) },
    rest: { port: Number(env.REST_PORT) },
    pyth: {
      priceService: {
        mainnet: env.PYTH_PRICESERVICE_MAINNET,
        testnet: env.PYTH_PRICESERVICE_TESTNET,
        devnet: env.PYTH_PRICESERVICE_DEVNET,
        pollIntervalMs: Number(env.PYTH_PRICESERVICE_POLL_INTERVAL_MS),
        requestBlockSize: Number(env.PYTH_PRICESERVICE_REQUEST_BLOCKSIZE)
      }
    },
    log: {
      appName: env.LOG_APPNAME,
      disableConsoleLog: env.LOG_DISABLE_CONSOLE_LOG === 'true',
      fileLog: {
        dir: env.LOG_FILELOG_DIR,
        daysToKeep: Number(env.LOG_FILELOG_DAYSTOKEEP)
      },
      debugLevel: Number(env.LOG_DEBUGLEVEL)
    },
    algo: {
      token: env.ALGO_TOKEN ?? '',
      api: env.ALGO_API,
      port: env.ALGO_PORT ?? '',
      dumpFailedTx: env.ALGO_DUMPFAILEDTX === 'true',
      dumpFailedTxDirectory: env.ALGO_DUMPFAILEDTX_DIRECTORY,
      getNetworkTxParamsCycleInterval: Number(env.ALGO_GET_NETWORK_TX_PARAMS_CYCLE_INTERVAL)
    },
    apps: {
      pricecasterAppId: Number(env.APPS_PRICECASTER_APPID),
      ownerMnemonic: env.APPS_OWNER_KEY_MNEMO
    },
    debug: {
      skipPublish: env.DEBUG_SKIP_PUBLISH === 'true'
    },
    storage: {
      db: env.STORAGE_DB
    },
    network: env.NETWORK as 'mainnet' | 'testnet' | 'devnet'
  }
}
