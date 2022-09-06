/* eslint-disable no-unused-expressions */
import PricecasterLib, { PRICECASTER_CI } from '../lib/pricecaster'
import tools from '../tools/app-tools'
import algosdk, { Account, generateAccount, makePaymentTxnWithSuggestedParams, Transaction } from 'algosdk'
const { expect } = require('chai')
const chai = require('chai')
const spawnSync = require('child_process').spawnSync
const testConfig = require('./test-config')
chai.use(require('chai-as-promised'))

// ===============================================================================================================

let pclib: PricecasterLib
let algodClient: algosdk.Algodv2
let ownerAccount: algosdk.Account
type AssetMapEntry = { decimals: number, assetId: number | undefined, samplePrice: number, exponent: number }

type StoredPriceData = {
  pythPrice: bigint,
  normalizedPrice: bigint,
  confidence: bigint,
  exponent: number,
  priceEMA: bigint,
  confEMA: bigint,
  status: number,
  timestamp: bigint,
  productPriceKey: Uint8Array
}

// ===============================================================================================================

async function createPricecasterApp (coreId: number) {
  const out = spawnSync(testConfig.PYTHON_BIN, [testConfig.PYTEALSOURCE])
  if (out.error) {
    throw new Error(out.error.toString())
  }

  if (out.status !== 0) {
    throw new Error(out.stderr.toString())
  }

  console.log(out.output.toString())

  console.log('Deploying Pricecaster V2 Application...')
  const txId = await pclib.createPricecasterApp(ownerAccount.addr, coreId, true, signCallback)
  console.log('txId: ' + txId)
  const txResponse = await pclib.waitForTransactionResponse(txId)
  const pkAppId = pclib.appIdFromCreateAppResponse(txResponse)
  pclib.setAppId(PRICECASTER_CI, pkAppId)

  console.log('Funding with min balance...')

  const paymentTx = makePaymentTxnWithSuggestedParams(ownerAccount.addr,
    algosdk.getApplicationAddress(pkAppId), 100000, undefined, undefined, await algodClient.getTransactionParams().do())

  const paymentTxId = await algodClient.sendRawTransaction(paymentTx.signTxn(ownerAccount.sk)).do()
  await algosdk.waitForConfirmation(algodClient, paymentTxId.txId, 1)
  return pkAppId
}

function signCallback (sender: string, tx: Transaction) {
  return tx.signTxn(ownerAccount.sk)
}

async function createAsset (decimals: number): Promise<number> {
  const params = await algodClient.getTransactionParams().do()
  params.fee = 1000
  params.flatFee = true

  const tx = algosdk.makeAssetCreateTxnWithSuggestedParams(
    ownerAccount.addr,
    undefined,
    1_000_000,
    decimals,
    false,
    ownerAccount.addr,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    params)

  const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
  const txResponse = await pclib.waitForTransactionResponse(txId)
  return pclib.assetIdFromCreateAppResponse(txResponse)
}

function prepareStoreTxParameters (assetMap: AssetMapEntry[], statusByte?: string): { payload: Buffer, flatU8ArrayAssetIds: Uint8Array, assetIds: number[]} {
  let payload: Buffer
  const hdr = Buffer.from('5032574800030000000102', 'hex')

  // Attestations and size of each
  const attcount = Buffer.alloc(2)
  attcount.writeInt16BE(assetMap.length)
  const attsize = Buffer.from('0095', 'hex')

  payload = Buffer.concat([hdr, attcount, attsize])

  // Write attestations encoding payload

  for (const val of assetMap) {
    const productId = Buffer.from('aa'.repeat(32), 'hex')
    const priceId = Buffer.from('bb'.repeat(32), 'hex')
    const price = Buffer.alloc(8)
    price.writeBigUInt64BE(BigInt(val.samplePrice))
    const conf = Buffer.from('cc000000000000ff', 'hex')
    const exp = Buffer.alloc(4)
    exp.writeInt32BE(val.exponent)
    const ema = Buffer.from('111111111111111ff22222222222222ff', 'hex')
    const stat = Buffer.from(statusByte ?? '01', 'hex')
    const numpub = Buffer.from('00000004', 'hex')
    const maxnumpub = Buffer.from('00000006', 'hex')
    const time = Buffer.from('000000006283efc2', 'hex')
    const pubtime = Buffer.from('000000006283efc3', 'hex')
    const remfields = Buffer.from('000000006283efc400000000008823d60000000000004be2', 'hex')

    payload = Buffer.concat([payload, productId, priceId, price, conf, exp, ema, stat, numpub, maxnumpub, time, pubtime, remfields])
  }

  const flatU8ArrayAssetIds = new Uint8Array(8 * assetMap.length)
  const assetIds: number[] = []
  let offset = 0
  assetMap.forEach((a: AssetMapEntry) => {
    flatU8ArrayAssetIds.set(algosdk.encodeUint64(a.assetId!), offset)
    assetIds.push(a.assetId!)
    offset += 8
  })

  return { payload, flatU8ArrayAssetIds, assetIds }
}

async function createAssets (assetMap: AssetMapEntry[]) {
  for (const [i, val] of assetMap.entries()) {
    if (assetMap[i].assetId === undefined) {
      assetMap[i].assetId = await createAsset(val.decimals)
    }
  }
}

async function testOkCase (decimals: number,
  samplePrice: number,
  exponent: number,
  assetIdOverride?: number): Promise<StoredPriceData> {
  const assetMap = [
    { decimals, assetId: assetIdOverride, samplePrice, exponent }
  ]

  await createAssets(assetMap)
  const txParams = prepareStoreTxParameters(assetMap)

  const tx = await pclib.makePriceStoreTx(ownerAccount.addr,
    txParams.flatU8ArrayAssetIds,
    txParams.assetIds,
    txParams.payload)

  const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
  const txResponse = await pclib.waitForTransactionResponse(txId)
  expect(txResponse['pool-error']).to.equal('')

  const data = await tools.readAppGlobalStateByKey(algodClient, pclib.getAppId(PRICECASTER_CI), ownerAccount.addr, assetMap[0].assetId!)
  expect(data).not.to.be.undefined

  const dataBuf = Buffer.from(data!, 'base64')
  const pythPrice = dataBuf.subarray(0, 8).readBigUint64BE()
  const normalizedPrice = dataBuf.subarray(8, 16).readBigUint64BE()
  const confidence = dataBuf.subarray(16, 24).readBigUint64BE()
  const exp = dataBuf.subarray(24, 28).readInt32BE()
  const priceEMA = dataBuf.subarray(28, 36).readBigUint64BE()
  const confEMA = dataBuf.subarray(36, 44).readBigUint64BE()
  const status = dataBuf.readUInt8(44)
  const timestamp = dataBuf.subarray(45, 53).readBigUint64BE()
  const productPriceKey = dataBuf.subarray(53)

  // console.log(normalizedPrice)
  expect(pythPrice).to.equal(BigInt(assetMap[0].samplePrice))
  expect(normalizedPrice).to.equal(BigInt(Math.round(assetMap[0].samplePrice * Math.pow(10, (12 + assetMap[0].exponent - (assetIdOverride === 0 ? 6 : assetMap[0].decimals))))))
  expect(exp).to.equal(assetMap[0].exponent)
  expect(confidence).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8))
  expect(priceEMA).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8 + 8 + 4))
  expect(confEMA).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8 + 8 + 8 + 4))
  expect(status).to.equal(txParams.payload.readUInt8(15 + 64 + 8 + 8 + 4 + 8 + 8))
  expect(timestamp).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8 + 8 + 4 + 8 + 8 + 1 + 8))

  return {
    pythPrice,
    normalizedPrice,
    confidence,
    exponent: exp,
    priceEMA,
    confEMA,
    status,
    timestamp,
    productPriceKey
  }
}

async function testFailCase (decimals: number,
  // eslint-disable-next-line camelcase
  samplePrice: number,
  exponent: number,
  assetIdOverride?: number,
  sender: Account = ownerAccount) {
  const assetMap = [
    { decimals, assetId: assetIdOverride, samplePrice, exponent }
  ]

  await createAssets(assetMap)
  const txParams = prepareStoreTxParameters(assetMap)

  const tx = await pclib.makePriceStoreTx(sender.addr,
    txParams.flatU8ArrayAssetIds,
    txParams.assetIds,
    txParams.payload)
  
  await expect(algodClient.sendRawTransaction(tx.signTxn(sender.sk)).do()).to.be.rejectedWith(/logic eval error/)
}

// ===============================================================================================================
//
// Test suite starts here
//
// ===============================================================================================================

describe('Pricecaster App Tests', function () {
  before(async function () {
    ownerAccount = algosdk.mnemonicToSecretKey(testConfig.OWNER_MNEMO)
    algodClient = new algosdk.Algodv2(testConfig.ALGORAND_NODE_TOKEN, testConfig.ALGORAND_NODE_HOST, testConfig.ALGORAND_NODE_PORT)
    pclib = new PricecasterLib(algodClient, ownerAccount.addr)
  }
  )

  it('Must create pricecaster V2 app with Core app id set', async function () {
    const dummyCoreId = 10000
    await createPricecasterApp(dummyCoreId)
    console.log('    - [Created pricecaster appId: %d]', PRICECASTER_CI.appId)

    const thisCoreId = await tools.readAppGlobalStateByKey(algodClient, PRICECASTER_CI.appId, ownerAccount.addr, 'coreid')
    expect(thisCoreId).to.equal(dummyCoreId)
  })

  after(async function () {
    await pclib.deleteApp(ownerAccount.addr, signCallback, PRICECASTER_CI)
  })

  it('Must ignore payload with status != 1 and log message', async function () {
    const assetMap = [
      { decimals: 5, assetId: undefined, samplePrice: 10000, exponent: -8 }
    ]

    await createAssets(assetMap)
    const txParams = prepareStoreTxParameters(assetMap, '00')

    const tx = await pclib.makePriceStoreTx(ownerAccount.addr,
      txParams.flatU8ArrayAssetIds,
      txParams.assetIds,
      txParams.payload)

    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    const txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')
    expect(txResponse.logs[0]).to.deep.equal(Buffer.concat([Buffer.from('PC_IGNORED_PRICE_INVALID_STATUS '), Buffer.from(algosdk.encodeUint64(txParams.assetIds[0]))]))
  })

  it('Must handle five attestations with enough opcode budget', async function () {
    const assetMap = [
      { decimals: 5, assetId: undefined, samplePrice: 10000, exponent: -8 },
      { decimals: 6, assetId: undefined, samplePrice: 10000, exponent: -7 },
      { decimals: 7, assetId: undefined, samplePrice: 10000, exponent: -6 },
      { decimals: 8, assetId: undefined, samplePrice: 10000, exponent: -5 },
      { decimals: 3, assetId: undefined, samplePrice: 10000, exponent: -4 }
    ]

    await createAssets(assetMap)
    const txParams = prepareStoreTxParameters(assetMap)

    const tx = await pclib.makePriceStoreTx(ownerAccount.addr,
      txParams.flatU8ArrayAssetIds,
      txParams.assetIds,
      txParams.payload)

    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    const txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')
  })

  it('Must handle boundary case d=19 e=12', async function () {
    await testOkCase(19, 1, 12)
  })

  it('Must handle boundary case d=19 e=-12', async function () {
    await testOkCase(19, 1, -12)
  })

  it('Must fail boundary case d=0 e=12', async function () {
    await testFailCase(0, 1, 12)
  })

  it('Must handle boundary case d=0 e=-12', async function () {
    await testOkCase(0, 1, -12)
  })

  it('Must handle zero exponent case (d=0)', async function () {
    await testOkCase(0, 1, 0)
  })

  it('Must handle zero exponent case (d=19)', async function () {
    await testOkCase(19, 1, 0)
  })

  it('Must handle asset 0 (ALGO) as 6 decimal asset', async function () {
    // Will substitute bogus 9999999999 decimals to 6 since asset 0 is interpreted as 6 decimal (ALGO)
    await testOkCase(9999999999, 100000, -8, 0)
  })

  it('Must fail to store unknown asset ID', async function () {
    await testFailCase(4, 1000, -8, 99999999999)
  })

  it('Must fail to store from non-creator account', async function () {
    const altAccount = generateAccount()
    const paymentTx = makePaymentTxnWithSuggestedParams(ownerAccount.addr, altAccount.addr, 400000, undefined, undefined, await algodClient.getTransactionParams().do())
    const paymentTxId = await algodClient.sendRawTransaction(paymentTx.signTxn(ownerAccount.sk)).do()
    await algosdk.waitForConfirmation(algodClient, paymentTxId.txId, 4)
    await testFailCase(4, 1, -8, undefined, altAccount)
  })
})
