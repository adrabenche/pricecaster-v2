import algosdk, { Account, Algodv2, assignGroupID, waitForConfirmation } from 'algosdk'
import { IPublisher, PublishInfo } from './IPublisher'
import { StatusCode } from '../common/statusCodes'
import { PythData } from 'backend/common/basetypes'
import { submitVAAHeader, TransactionSignerPair } from '@certusone/wormhole-sdk/lib/cjs/algorand'
import PricecasterLib, { PRICECASTER_CI } from '../../lib/pricecaster'
import * as Logger from '@randlabs/js-logger'

export class PricecasterPublisher implements IPublisher {
  private algodClient: algosdk.Algodv2
  private pclib: PricecasterLib
  constructor (readonly wormholeCoreId: bigint,
    readonly priceCasterAppId: bigint,
    readonly sender: algosdk.Account,
    readonly algodv2: Algodv2,
    readonly dumpFailedTx: boolean = false,
    readonly dumpFailedTxDirectory: string = './') {
    this.algodClient = algodv2
    this.pclib = new PricecasterLib(this.algodClient, sender.addr)
    this.pclib.enableDumpFailedTx(this.dumpFailedTx)
    this.pclib.setDumpFailedTxDirectory(this.dumpFailedTxDirectory)

    // HORRIBLE!!!! FIX ME:  Change Appid to bigints!
    this.pclib.setAppId(PRICECASTER_CI, parseInt(priceCasterAppId.toString()))
  }

  async start () {
  }

  stop () {
    Logger.info('Stopping publisher.')
  }

  signCallback (sender: string, tx: algosdk.Transaction) {
    const txSigned = tx.signTxn(this.sender.sk)
    return txSigned
  }

  async publish (data: PythData): Promise<PublishInfo> {
    try {
      const submitVaaState = await submitVAAHeader(this.algodClient, BigInt(this.wormholeCoreId), new Uint8Array(data.vaa), this.sender.addr, BigInt(this.priceCasterAppId))
      const txs = submitVaaState.txs

      const flatU8ArrayAssetIds = new Uint8Array(8 * data.attestations.length)
      const intAssetIds: number[] = []
      let offset = 0
      let found = 0
      data.attestations.forEach(att => {
        if (att.asaId !== undefined) {
          flatU8ArrayAssetIds.set(algosdk.encodeUint64(att.asaId), offset)
          intAssetIds.push(att.asaId)
          offset += 8
          found++
        }
      })

      if (found > 0) {
        const storeTx = await this.pclib.makePriceStoreTx(this.sender.addr, flatU8ArrayAssetIds, intAssetIds, data.payload)
        txs.push({ tx: storeTx, signer: null })
        const ret = await signSendAndConfirmAlgorand(this.algodClient, txs, this.sender)

        if (ret['pool-error'] === '') {
          if (ret['confirmed-round']) {
            Logger.info(` ✔ Confirmed at round ${ret['confirmed-round']}    Store TxID: ${storeTx.txID()}`)
          } else {
            Logger.info('⚠ No confirmation information')
          }
        } else {
          Logger.error(`❌ Rejected: ${ret['pool-error']}`)
        }
      }

      Logger.info(`     ${found} of ${data.attestations.length} attestation(s) published.`)
      data.attestations.forEach((att) => {
        if (att.symbol === undefined) {
          Logger.info(`   ⚠️ ${att.productId}${att.priceId} unpublished (no symbol mapping) ${att.price} ± ${att.conf} exp: ${att.expo}    price EMA:${att.ema_price} conf EMA: ${att.ema_conf}`)
        } else if (att.asaId === undefined) {
          Logger.info(`   ⚠️ ${att.symbol} unpublished (no ASA ID) ${att.price} ± ${att.conf} exp: ${att.expo}    price EMA:${att.ema_price} conf EMA: ${att.ema_conf}`)
        } else {
          Logger.info(`     ${att.symbol} (Asset ${att.asaId})      ${att.price} ± ${att.conf} exp: ${att.expo}    price EMA:${att.ema_price} conf EMA: ${att.ema_conf}`)
        }
      })
    } catch (e: any) {
      Logger.error(`❌ Error submitting TX: ${e.toString()}`)
    }

    return {
      status: StatusCode.OK
    }
  }
}

async function signSendAndConfirmAlgorand (
  algodClient: Algodv2,
  txs: TransactionSignerPair[],
  wallet: Account
) {
  assignGroupID(txs.map((tx) => tx.tx))
  const signedTxns: Uint8Array[] = []
  for (const tx of txs) {
    if (tx.signer) {
      signedTxns.push(await tx.signer.signTxn(tx.tx))
    } else {
      signedTxns.push(tx.tx.signTxn(wallet.sk))
    }
  }
  await algodClient.sendRawTransaction(signedTxns).do()
  const result = await waitForConfirmation(
    algodClient,
    txs[txs.length - 1].tx.txID(),
    4
  )
  return result
}
