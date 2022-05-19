import algosdk, { Account, Algodv2, assignGroupID, waitForConfirmation } from 'algosdk'
import { IPublisher, PublishInfo } from './IPublisher'
import { StatusCode } from '../common/statusCodes'
import { PythData } from 'backend/common/basetypes'
import { submitVAAHeader, TransactionSignerPair } from '@certusone/wormhole-sdk/lib/cjs/algorand'
import PricecasterLib from '../../lib/pricecaster'
import * as Logger from '@randlabs/js-logger'

export class Pricekeeper2Publisher implements IPublisher {
  private algodClient: algosdk.Algodv2
  private pclib: PricecasterLib
  private account: algosdk.Account
  private wormholeCoreId: bigint
  private priceCasterAppId: bigint
  private sender: string
  private dumpFailedTx: boolean
  private dumpFailedTxDirectory: string | undefined
  private compiledVerifyProgram: { bytes: Uint8Array, hash: string } = { bytes: new Uint8Array(), hash: '' }
  constructor (wormholeCoreId: bigint,
    priceCasterAppId: bigint,
    sender: string,
    verifyProgramBinary: Uint8Array,
    verifyProgramHash: string,
    signKey: algosdk.Account,
    algoClientToken: string,
    algoClientServer: string,
    algoClientPort: string,
    dumpFailedTx: boolean = false,
    dumpFailedTxDirectory: string = './') {
    this.account = signKey
    this.priceCasterAppId = priceCasterAppId
    this.compiledVerifyProgram.bytes = verifyProgramBinary
    this.compiledVerifyProgram.hash = verifyProgramHash
    this.wormholeCoreId = wormholeCoreId
    this.sender = sender
    this.dumpFailedTx = dumpFailedTx
    this.dumpFailedTxDirectory = dumpFailedTxDirectory
    this.algodClient = new algosdk.Algodv2(algoClientToken, algoClientServer, algoClientPort)
    this.pclib = new PricecasterLib(this.algodClient, sender)
    this.pclib.enableDumpFailedTx(this.dumpFailedTx)
    this.pclib.setDumpFailedTxDirectory(this.dumpFailedTxDirectory)
  }

  async start () {
  }

  stop () {
  }

  signCallback (sender: string, tx: algosdk.Transaction) {
    const txSigned = tx.signTxn(this.account.sk)
    return txSigned
  }

  async publish (data: PythData): Promise<PublishInfo> {
    // const submitVaaState = await submitVAAHeader(this.algodClient, BigInt(this.wormholeCoreId), data.vaa, this.sender, BigInt(this.priceCasterAppId))
    // const txs = submitVaaState.txs
    // txs.push({ tx: await this.pclib.makePriceStoreTx(this.sender, data.vaa), signer: null })
    // const ret = await signSendAndConfirmAlgorand(this.algodClient, txs, this.account)
    // console.log(ret)

    data.attestations.forEach((att) => {
      Logger.info(`     ${att.symbol}     ${att.price} ± ${att.conf} exp: ${att.expo} twap:${att.ema_price}`)
    })

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
    1
  )
  return result
}