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
import algosdk, { Account, Algodv2, assignGroupID, SuggestedParams } from 'algosdk'
import { getPriceIdsInVaa } from '../common/pythPayload'
import { getWormholeCoreAppId, IAppSettings } from '../common/settings'
import { SlotLayout } from '../common/slotLayout'
import _ from 'underscore'
import PricecasterLib, { PRICECASTER_CI, AsaIdSlot } from '../../lib/pricecaster'
import { IPublisher } from './IPublisher'
import { Statistics } from 'backend/engine/Stats'

export class PricecasterPublisher implements IPublisher {
  private active: boolean
  private algodClient: algosdk.Algodv2
  private pclib: PricecasterLib
  constructor (readonly algodv2: Algodv2,
    readonly senderAccount: algosdk.Account,
    readonly stats: Statistics,
    readonly settings: IAppSettings,
    readonly slotLayout: SlotLayout) {
    this.algodClient = algodv2
    this.pclib = new PricecasterLib(this.algodClient, senderAccount.addr)
    this.pclib.enableDumpFailedTx(this.settings.algo.dumpFailedTx)
    this.pclib.setDumpFailedTxDirectory(this.settings.algo.dumpFailedTxDirectory ?? '/.')
    this.pclib.setAppId(PRICECASTER_CI, this.settings.apps.pricecasterAppId)
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
    const t0 = _.now()
    const txParams = await this.algodClient.getTransactionParams().do()
    // console.log(`time. getTransactionParams: ${_.now() - t0}`)

    const publishCalls: Promise<any>[] = []
    for (const vaa of vaaList) {
      publishCalls.push(this.submit(txParams, vaa))
    }

    const pricesPublish = await Promise.allSettled(publishCalls)

    pricesPublish.forEach((p) => {
      if (p.status === 'fulfilled') {
        this.stats.increaseSuccessTxCount()
      } else if (p.status === 'rejected') {
        console.log('Transaction rejected. Reason: ' + p.reason)
        this.stats.increaseFailedTxCount()
      }
    })
  }

  /**
   * Build the ASAIDSlots structure used to build "store" call.
   * For ASAs that we want to ignore, a -1 value is set.
   */
  buildAsaIdSlots (priceIdsInVaa: string[]): AsaIdSlot[] {
    const asaIdSlots: AsaIdSlot[] = []
    for (let i = 0; i < priceIdsInVaa.length; i++) {
      const slotInfo = this.slotLayout.getSlotByPriceId(priceIdsInVaa[i])
      asaIdSlots.push(slotInfo ? { asaid: slotInfo.asaId, slot: slotInfo.slot! } : { asaid: -1, slot: 0xff })
    }
    return asaIdSlots
  }

  /**
   * Submit the prices using the VAA.
   */
  async submit (txParams: SuggestedParams, vaa: Uint8Array): Promise<any> {
    const vaaParsed = parseVaa(vaa)
    const priceIdsInVaa = getPriceIdsInVaa(vaaParsed.payload)
    const asaIdSlots = this.buildAsaIdSlots(priceIdsInVaa)

    // console.log(asaIdSlots)

    const txs: TransactionSignerPair[] = []
    const signedGroupedTxns: Uint8Array[] = []
    const t0 = _.now()
    const submitVaaState = await submitVAAHeader(this.algodClient, BigInt(getWormholeCoreAppId(this.settings)),
      new Uint8Array(vaa), this.senderAccount.addr, BigInt(this.settings.apps.pricecasterAppId))
    // console.log(`submitVaaHeader time: ${_.now() - t0}ms`)

    txs.push(...submitVaaState.txs)
    txParams.fee = 1000 * (priceIdsInVaa.length - 1)
    const tx = this.pclib.makePriceStoreTx(this.senderAccount.addr,
      asaIdSlots,
      vaaParsed.payload,
      txParams)

    txs.push({ tx, signer: null })

    assignGroupID(txs.map((tx) => tx.tx))
    const signedTxns = await sign(txs, this.senderAccount)

    signedGroupedTxns.push(...signedTxns)
    const txReq = this.algodClient.sendRawTransaction(signedGroupedTxns).do()
    return txReq
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
