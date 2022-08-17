/**
 * Pricecaster Service.
 *
 * Copyright 2022 Wormhole Project Contributors
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
import algosdk from 'algosdk'
import { PythSymbolInfo } from 'backend/engine/SymbolInfo'
import { PythSymbolToAsaIdMainnet, PythSymbolToAsaIdTestnet } from './SymbolMap'
import * as Logger from '@randlabs/js-logger'
import { base58 } from 'ethers/lib/utils'
import PricecasterLib, { MAPPER_CI } from '../../lib/pricecaster'

export class Pyth2AsaMapper {
  private algodClient: algosdk.Algodv2
  private pclib: any
  private account: algosdk.Account
  private mapperAppId: number
  private mappingData: Map<string, number | undefined>
  private symbolInfo: PythSymbolInfo
  constructor (mapperAppId: number,
    signKey: algosdk.Account,
    algoClientToken: string,
    algoClientServer: string,
    algoClientPort: string,
    sourceNetwork: 'mainnet' | 'testnet',
    symbolInfo: PythSymbolInfo) {
    this.account = signKey
    this.mapperAppId = mapperAppId
    this.algodClient = new algosdk.Algodv2(algoClientToken, algoClientServer, algoClientPort)
    this.pclib = new PricecasterLib(this.algodClient, this.account.addr)
    this.pclib.setAppId(MAPPER_CI, mapperAppId)
    this.symbolInfo = symbolInfo
    this.mappingData = sourceNetwork === 'testnet' ? PythSymbolToAsaIdTestnet : PythSymbolToAsaIdMainnet
  }

  signCallback (sender: string, tx: algosdk.Transaction) {
    return tx.signTxn(this.account.sk)
  }

  async updateMappings (writeOnChain: boolean = false) {
    const mapsToSet: { asaId: number, key: Uint8Array }[] = []
    this.symbolInfo.getRawMap().forEach((symbol, k) => {
      const symMap = this.mappingData.get(symbol)
      if (symMap !== undefined) {
        const hexKey = Buffer.from(base58.decode(k)).toString('hex')
        Logger.info(`Symbol ${symbol}, mapping ASA ID ${symMap} to key 0x${hexKey}`)
        mapsToSet.push({ asaId: symMap, key: base58.decode(k) })
      }
    })

    if (writeOnChain) {
      for (const e of mapsToSet) {
        const txId = await this.pclib.setMappingEntry(this.account.addr, e.asaId, e.key, this.signCallback.bind(this))
        Logger.info('Called Mapper entry set, TxId ' + txId)
      }
    }
  }

  lookupAsa (symbol: string): number | undefined {
    return this.mappingData.get(symbol)
  }
}
