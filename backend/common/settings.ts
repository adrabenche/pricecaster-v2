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
  pyth: {
    priceService: {
      mainnet: string,
      testnet: string,
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
    dumpFailedTxDirectory?: string
  },
  apps: {
    pricecasterAppId: bigint,
    ownerKeyFile: string,
    asaIdMapperAppId: number,
  },
  txMonitor: {
    updateIntervalMs: number,
    confirmationThreshold: number
  }
  debug?: {
    skipPublish?: boolean,
  },
  wormhole: {
    spyServiceHost: string
  },
  priceIds: {
    testnet: string[],
    mainnet: string[]
  }
  network: 'testnet' | 'mainnet'
}

const netUpper = (settings: IAppSettings) => settings.network.toUpperCase() as 'MAINNET' | 'TESTNET'

export function getWormholeCoreAppId (settings: IAppSettings) {
  return CONTRACTS[netUpper(settings)].algorand.core
}

export function getWormholeBridgeAppId (settings: IAppSettings) {
  return CONTRACTS[netUpper(settings)].algorand.token_bridge
}

export function getPriceIds (settings: IAppSettings): string[] {
  return settings.priceIds[settings.network]
}
