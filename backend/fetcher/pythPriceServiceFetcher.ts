/* eslint-disable camelcase */
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

import {
  createSpyRPCServiceClient, subscribeSignedVAA
} from '@certusone/wormhole-spydk'
import { PythAttestation, PythData, VAA } from 'backend/common/basetypes'
import { IPriceFetcher } from './IPriceFetcher'
import * as Logger from '@randlabs/js-logger'
import { PythSymbolInfo } from 'backend/engine/SymbolInfo'
import { base58 } from 'ethers/lib/utils'
import tools from '../../tools/app-tools'
import { IPublisher } from 'backend/publisher/IPublisher'
import { Pyth2AsaMapper } from 'backend/mapper/Pyth2AsaMapper'
import { sleep } from '../common/sleep'
import { Filter, IAppSettings } from '../common/settings'
import { FilterEntry } from '@certusone/wormhole-spydk/lib/cjs/proto/spy/v1/spy'
import { Price, PriceServiceConnection, PriceServiceConnectionConfig } from '@pythnetwork/pyth-common-js'
import { PriceServiceConnection2 } from './priceServiceClient'
import { parseVaa } from '@certusone/wormhole-sdk'
import { IVaaCache } from 'backend/vaacache/IVaaCache'

const PYTH_PAYLOAD_HEADER = 0x50325748
const SUPPORTED_MAJOR_PYTH_PAYLOAD_VERSION = 3
const SUPPORTED_MINOR_PYTH_PAYLOAD_VERSION = 0
const PYTH_ATTESTATION_PAYLOAD_ID = 2

export class PythPriceServiceFetcher {
  private priceServiceConnection: PriceServiceConnection2
  private data: PythData | undefined
  private lastVaaSeq: number = 0
  private active: boolean

  constructor (
    readonly settings: IAppSettings,
    readonly vaacache: IVaaCache) {
    this.priceServiceConnection = new PriceServiceConnection2(this.settings.pyth.priceService[this.settings.network],
      this.settings.pyth.priceServiceConfiguration)

    this.active = true
  }

  async getVaas () {
    const vaaList = await this.priceServiceConnection.getLatestVaasForIds(['0x08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318'])
    vaaList.forEach(vaa => console.log(parseVaa(vaa)))

    if (this.active) {
      setTimeout(async () => { this.getVaas() }, this.settings.pyth.priceService.pollIntervalMs)
    }
  }

  async start () {
    setTimeout(async () => { this.getVaas() }, this.settings.pyth.priceService.pollIntervalMs)
  }

  stop (): void {
    Logger.info('Stopping fetcher...')
    this.active = false
  }

  shutdown (): void {
    this.stop()
  }

  // private async onPythData (vaaBytes: Buffer) {
  // if (!this.active) {
  // return
  // }

  // const v: VAA = this.coreWasm.parse_vaa(new Uint8Array(vaaBytes))
  // if (v.sequence > this.lastVaaSeq) {
  // this.lastVaaSeq = v.sequence

  // // const h = sha512_256.create()
  // // h.update(JSON.stringify(v))
  // // console.log(h.hex())
  // const payload = Buffer.from(v.payload)

  // const header = payload.readInt32BE(0)
  // const major_version = payload.readInt16BE(4)
  // const minor_version = payload.readInt16BE(6)

  // if (header === PYTH_PAYLOAD_HEADER) {
  // // console.log(Buffer.from(v.emitter_address).toString('hex'), v.emitter_chain)
  // if (major_version === SUPPORTED_MAJOR_PYTH_PAYLOAD_VERSION) {
  // if (minor_version !== SUPPORTED_MINOR_PYTH_PAYLOAD_VERSION) {
  // Logger.warn(`Version for this payload is ${major_version}.${minor_version}, while we support ${SUPPORTED_MAJOR_PYTH_PAYLOAD_VERSION}.${SUPPORTED_MINOR_PYTH_PAYLOAD_VERSION}. Minor version changes shouldnt break parser. Contact administrator or dev team if any problem arises.`)
  // }
  // const hdr_size = payload.readInt16BE(8)
  // const payloadId = payload.readUInt8(10)
  // if (hdr_size === 1 && payloadId === PYTH_ATTESTATION_PAYLOAD_ID) {
  // const numAttest = payload.readInt16BE(11)
  // const sizeAttest = payload.readInt16BE(13)

  // //
  // // Extract attestations for VAA body
  // //
  // const attestations: PythAttestation[] = this.getAttestations(numAttest, payload, sizeAttest)
  // this.data = {
  // vaa: vaaBytes,
  // attestations,
  // payload: v.payload
  // }

  // Logger.info(`VAA gs=${v.guardian_set_index} #sig=${v.signatures.length} ts=${v.timestamp} nonce=${v.nonce} seq=${v.sequence} clev=${v.consistency_level} payload_size=${payload.length} #attestations=${numAttest}`)
  // this._hasData = true

  // await this.publisher.publish(this.data)
  // } else {
  // Logger.error(`Bad Pyth payload payload Id (${payloadId}). Expected ${PYTH_ATTESTATION_PAYLOAD_ID}`)
  // }
  // } else {
  // Logger.error(`Bad Pyth payload major version (${major_version}). Expected ${SUPPORTED_MAJOR_PYTH_PAYLOAD_VERSION}`)
  // }
  // } else {
  // Logger.error(`Bad payload header (0x${header.toString(16)}). Expected 'P2WH'`)
  // }
  // }
  // }

  // /*
  // * Get attestations from payload
  // */
  // private getAttestations (numAttest: number, payload: Buffer, sizeAttest: number): PythAttestation[] {
  // const attestations: PythAttestation[] = []
  // for (let i = 0; i < numAttest; ++i) {
  // const attestation = tools.extract3(payload, 15 + (i * sizeAttest), sizeAttest)
  // // console.log(i, attestation.toString('hex'))
  // const productId = tools.extract3(attestation, 0, 32)
  // const priceId = tools.extract3(attestation, 32, 32)

  // // // console.log(base58.encode(productId))
  // // // console.log(base58.encode(priceId))
  // const symbol = this.symbolInfo.getSymbol(base58.encode(productId), base58.encode(priceId))
  // let asaId
  // if (symbol) {
  // asaId = this.mapper.lookupAsa(symbol)
  // } else {
  // Logger.warn(`No symbol found for productId: ${productId} priceId: ${priceId}`)
  // }

  // const pythAttest: PythAttestation = {
  // symbol,
  // asaId,
  // productId,
  // priceId,
  // price: attestation.readBigUInt64BE(64),
  // conf: attestation.readBigUInt64BE(72),
  // expo: attestation.readInt32BE(80),
  // ema_price: attestation.readBigUInt64BE(84),
  // ema_conf: attestation.readBigUInt64BE(92),
  // status: attestation.readUInt8(100),
  // num_publishers: attestation.readUInt32BE(101),
  // max_num_publishers: attestation.readUInt32BE(105),
  // attestation_time: attestation.readBigUInt64BE(109),
  // publish_time: attestation.readBigUInt64BE(117),
  // prev_publish_time: attestation.readBigUInt64BE(125),
  // prev_price: attestation.readBigUInt64BE(133),
  // prev_conf: attestation.readBigUInt64BE(141)
  // }

  // attestations.push(pythAttest)
  // }
  // return attestations
  // }
}
