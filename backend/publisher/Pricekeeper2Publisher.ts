import algosdk, { Account, Algodv2, assignGroupID, waitForConfirmation } from 'algosdk'
import { IPublisher, PublishInfo } from './IPublisher'
import { StatusCode } from '../common/statusCodes'
import { PythData } from 'backend/common/basetypes'
import { submitVAAHeader, TransactionSignerPair } from '@certusone/wormhole-sdk/lib/cjs/algorand'
import PricecasterLib, { PRICECASTER_CI } from '../../lib/pricecaster'
import * as Logger from '@randlabs/js-logger'

export class Pricekeeper2Publisher implements IPublisher {
  private algodClient: algosdk.Algodv2
  private pclib: PricecasterLib
  constructor (readonly wormholeCoreId: bigint,
    readonly priceCasterAppId: bigint,
    readonly sender: algosdk.Account,
    readonly algoClientToken: string,
    readonly algoClientServer: string,
    readonly algoClientPort: string,
    readonly dumpFailedTx: boolean = false,
    readonly dumpFailedTxDirectory: string = './') {
    this.algodClient = new algosdk.Algodv2(algoClientToken, algoClientServer, algoClientPort)
    this.pclib = new PricecasterLib(this.algodClient, sender.addr)
    this.pclib.enableDumpFailedTx(this.dumpFailedTx)
    this.pclib.setDumpFailedTxDirectory(this.dumpFailedTxDirectory)

    // HORRIBLE!!!! FIX ME:  Change Appid to bigints!
    this.pclib.setAppId(PRICECASTER_CI, parseInt(priceCasterAppId.toString()))
  }

  async start () {
  }

  stop () {
  }

  signCallback (sender: string, tx: algosdk.Transaction) {
    const txSigned = tx.signTxn(this.sender.sk)
    return txSigned
  }

  async publish (data: PythData): Promise<PublishInfo> {
    try {
      const submitVaaState = await submitVAAHeader(this.algodClient, BigInt(this.wormholeCoreId), new Uint8Array(data.vaa), this.sender.addr, BigInt(this.priceCasterAppId))
      const txs = submitVaaState.txs
      txs.push({ tx: await this.pclib.makePriceStoreTx(this.sender.addr, data.payload), signer: null })
      const ret = await signSendAndConfirmAlgorand(this.algodClient, txs, this.sender)
      // console.log(ret)

      if (ret['pool-error'] === '') {
        if (ret['confirmed-round']) {
          Logger.info(` ✔ Confirmed at round ${ret['confirmed-round']}`)
        } else {
          Logger.info('⚠ No confirmation information')
        }
      } else {
        Logger.error(`❌ Rejected: ${ret['pool-error']}`)
      }

      data.attestations.forEach((att) => {
        Logger.info(`     ${att.symbol}     ${att.price} ± ${att.conf} exp: ${att.expo} twap:${att.ema_price}`)
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
