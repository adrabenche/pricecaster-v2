/**
 * Pricecaster Service.
 *
 * C3 Publisher class.
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

import { parseVaa } from '@certusone/wormhole-sdk'
import { submitVAAHeader, TransactionSignerPair } from '@certusone/wormhole-sdk/lib/cjs/algorand'
import * as Logger from '@randlabs/js-logger'
import algosdk, { Account, Algodv2, assignGroupID } from 'algosdk'
import _ from 'underscore'
import PricecasterLib, { PRICECASTER_CI } from '../../lib/pricecaster'
import { TxMonitor } from '../engine/txMonitor'
import { IPublisher } from './IPublisher'

export class PricecasterPublisher implements IPublisher {
  private active: boolean
  private algodClient: algosdk.Algodv2
  private pclib: PricecasterLib
  constructor (readonly wormholeCoreId: bigint,
    readonly priceCasterAppId: bigint,
    readonly senderAccount: algosdk.Account,
    readonly algodv2: Algodv2,
    readonly txMonitor: TxMonitor,
    readonly dumpFailedTx: boolean = false,
    readonly dumpFailedTxDirectory: string = './') {
    this.algodClient = algodv2
    this.pclib = new PricecasterLib(this.algodClient, senderAccount.addr)
    this.pclib.enableDumpFailedTx(this.dumpFailedTx)
    this.pclib.setDumpFailedTxDirectory(this.dumpFailedTxDirectory)

    // HORRIBLE!!!! FIX ME:  Change Appid to bigints!
    this.pclib.setAppId(PRICECASTER_CI, parseInt(priceCasterAppId.toString()))
    this.active = false
  }

  start () {
    this.active = true
  }

  stop () {
    this.active = false
    Logger.info('Stopping publisher.')
  }

  async publish (vaaList: Uint8Array[]) {
    if (!this.active) {
      return
    }
    console.log(vaaList.length)
    const t0 = _.now()
    const txParams = await this.algodClient.getTransactionParams().do()
    console.log(_.now() - t0)
    let offset = 0

    for await (const vaa of vaaList) {
      const vaaParsed = parseVaa(vaa)
      console.log(vaaParsed.payload.length)
      const flatU8ArrayAssetIds = new Uint8Array(8 * 5)
      const intAssetIds: number[] = []
      flatU8ArrayAssetIds.set(algosdk.encodeUint64(0), offset)
      intAssetIds.push(0)
      offset += 8

      try {
        const txs: TransactionSignerPair[] = []
        const signedGroupedTxns: Uint8Array[] = []
        const submitVaaState = await submitVAAHeader(this.algodClient, BigInt(this.wormholeCoreId), new Uint8Array(vaa), this.senderAccount.addr, BigInt(this.priceCasterAppId))

        txs.push(...submitVaaState.txs)
        const tx = this.pclib.makePriceStoreTx(this.senderAccount.addr, flatU8ArrayAssetIds, intAssetIds, vaaParsed.payload, txParams)
        txs.push({ tx, signer: null })

        assignGroupID(txs.map((tx) => tx.tx))
        const signedTxns = await sign(txs, this.senderAccount)

        signedGroupedTxns.push(...signedTxns)
        const txReq = await this.algodClient.sendRawTransaction(signedGroupedTxns).do()
        this.txMonitor.addPendingTx(txReq.txId)
      } catch (e: any) {
        Logger.error(`Error generating submit-VAA or Price store TX for VAA: ${vaaParsed}, error ${e.toString()}`)
      }
    }
  }
}
async function sign (
  txs: TransactionSignerPair[],
  wallet: Account
) {
  const signedTxns: Uint8Array[] = []
  for (const tx of txs) {
    if (tx.signer) {
      signedTxns.push(await tx.signer.signTxn(tx.tx))
    } else {
      signedTxns.push(tx.tx.signTxn(wallet.sk))
    }
  }
  return signedTxns
}
