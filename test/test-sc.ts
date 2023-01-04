/* eslint-disable no-unused-expressions */
import PricecasterLib, { PRICECASTER_CI } from '../lib/pricecaster'
import tools from '../tools/app-tools'
import algosdk, { Account, generateAccount, makePaymentTxnWithSuggestedParams, Transaction } from 'algosdk'
const { expect } = require('chai')
const chai = require('chai')
const spawnSync = require('child_process').spawnSync
const testConfig = require('./test-config')
chai.use(require('chai-as-promised'))

const GLOBAL_SLOT_SIZE = 92

// ===============================================================================================================

let pclib: PricecasterLib
let algodClient: algosdk.Algodv2
let ownerAccount: algosdk.Account
type AssetMapEntry = { decimals: number, assetId: number | undefined, samplePrice: number, exponent: number }

type StoredPriceData = {
  asaId: number,
  normalizedPrice: bigint,
  pythPrice: bigint,
  confidence: bigint,
  exponent: number,
  priceEMA: bigint,
  confEMA: bigint,
  attTime: bigint,
  pubTime: bigint,
  prevPubTime: bigint,
  prevPrice: bigint,
  prevConf: bigint
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
  const txId = await pclib.createPricecasterApp(ownerAccount.addr, coreId, true, signCallback, 2000)
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

async function deleteAsset (assetId: number): Promise<string> {
  const params = await algodClient.getTransactionParams().do()
  params.fee = 1000

  const tx = algosdk.makeAssetDestroyTxnWithSuggestedParams(
    ownerAccount.addr,
    undefined,
    assetId,
    params)

  const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
  await pclib.waitForTransactionResponse(txId)
  return txId
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

async function deleteAssets (assetMap: AssetMapEntry[]) {
  for (const asset of assetMap) {
    if (asset.assetId !== undefined) {
      await deleteAsset(asset.assetId!)
    }
  }
}

async function deleteAllAssets () {
  const accountInfo = await algodClient.accountInformation(ownerAccount.addr).do()
  for (const asset of accountInfo['created-assets']) {
    console.log(asset)
    await deleteAsset(asset.index)
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
  const params = await algodClient.getTransactionParams().do()
  params.fee = 2000
  const tx = pclib.makePriceStoreTx(ownerAccount.addr,
    assetMap.map((v, i) => { return { asaid: v.assetId!, slot: i } }),
    txParams.payload,
    params)

  const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
  const txResponse = await pclib.waitForTransactionResponse(txId)
  expect(txResponse['pool-error']).to.equal('')

  const dataBuf = await getGlobalPriceSlot(0)
  const asaId = dataBuf.subarray(0, 8).readBigInt64BE()
  const normalizedPrice = dataBuf.subarray(8, 16).readBigUint64BE()
  const pythPrice = dataBuf.subarray(16, 24).readBigUint64BE()
  const confidence = dataBuf.subarray(24, 32).readBigUint64BE()
  const exp = dataBuf.subarray(32, 36).readInt32BE()
  const priceEMA = dataBuf.subarray(36, 44).readBigUint64BE()
  const confEMA = dataBuf.subarray(44, 52).readBigUint64BE()
  const attTime = dataBuf.subarray(52, 60).readBigUint64BE()
  const pubTime = dataBuf.subarray(60, 68).readBigUint64BE()
  const prevPubTime = dataBuf.subarray(68, 76).readBigUint64BE()
  const prevPrice = dataBuf.subarray(76, 84).readBigUint64BE()
  const prevConf = dataBuf.subarray(84, 92).readBigUInt64BE()

  // console.log(normalizedPrice)
  expect(pythPrice).to.equal(BigInt(assetMap[0].samplePrice))
  expect(normalizedPrice).to.equal(BigInt(Math.round(assetMap[0].samplePrice * Math.pow(10, (12 + assetMap[0].exponent - (assetIdOverride === 0 ? 6 : assetMap[0].decimals))))))
  expect(exp).to.equal(assetMap[0].exponent)
  expect(confidence).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8))
  expect(priceEMA).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8 + 8 + 4))
  expect(confEMA).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8 + 8 + 8 + 4))
  expect(attTime).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8 + 8 + 4 + 8 + 8 + 1 + 8))
  expect(pubTime).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8 + 8 + 4 + 8 + 8 + 1 + 8 + 8))
  expect(prevPubTime).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8 + 8 + 4 + 8 + 8 + 1 + 8 + 8 + 8))
  expect(prevPrice).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8 + 8 + 4 + 8 + 8 + 1 + 8 + 8 + 8 + 8))
  expect(prevConf).to.equal(txParams.payload.readBigUInt64BE(15 + 64 + 8 + 8 + 4 + 8 + 8 + 1 + 8 + 8 + 8 + 8 + 8))

  await deleteAssets(assetMap)
  return {
    asaId: parseInt(asaId.toString()),
    pythPrice,
    normalizedPrice,
    confidence,
    exponent: exp,
    priceEMA,
    confEMA,
    attTime,
    pubTime,
    prevPubTime,
    prevPrice,
    prevConf
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

  const params = await algodClient.getTransactionParams().do()
  params.fee = 2000
  const tx = pclib.makePriceStoreTx(sender.addr,
    assetMap.map((v, i) => { return { asaid: v.assetId!, slot: i } }),
    txParams.payload,
    params)

  await expect(algodClient.sendRawTransaction(tx.signTxn(sender.sk)).do()).to.be.rejectedWith(/logic eval error/)

  if (!assetIdOverride) {
    deleteAssets(assetMap)
  }
}

async function fetchGlobalStore (): Promise<Buffer> {
  let buf: Buffer = Buffer.alloc(0)
  for await (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
    const val = Buffer.from(await pclib.readGlobalStateByKey(String.fromCharCode(i), PRICECASTER_CI, true), 'base64')
    buf = Buffer.concat([buf, val])
  }
  return buf
}

async function getGlobalPriceSlot (slot: number): Promise<Buffer> {
  return (await fetchGlobalStore()).subarray(GLOBAL_SLOT_SIZE * slot, GLOBAL_SLOT_SIZE * slot + GLOBAL_SLOT_SIZE)
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
    await deleteAllAssets()
  })

  it('Must ignore payload with status != 1 and log message', async function () {
    const assetMap = [
      { decimals: 5, assetId: undefined, samplePrice: 10000, exponent: -8 }
    ]

    await createAssets(assetMap)
    const txParams = prepareStoreTxParameters(assetMap, '00')
    const params = await algodClient.getTransactionParams().do()
    params.fee = 2000
    params.flatFee = true

    const tx = await pclib.makePriceStoreTx(ownerAccount.addr,
      assetMap.map(v => { return { asaid: v.assetId!, slot: 0 } }),
      txParams.payload,
      params)

    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    const txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')
    expect(txResponse.logs[0]).to.deep.equal(Buffer.concat([Buffer.from('PC_IGNORED_PRICE_INVALID_STATUS '), Buffer.from(algosdk.encodeUint64(txParams.assetIds[0]))]))

    await deleteAssets(assetMap)
  })

  it('Must handle one attestation at index 0 with enough opcode budget', async function () {
    const assetMap = [
      { decimals: 5, assetId: undefined, samplePrice: 10000, exponent: -8 }
    ]

    await createAssets(assetMap)
    const txParams = prepareStoreTxParameters(assetMap)

    const params = await algodClient.getTransactionParams().do()
    params.fee = 2000

    const tx = pclib.makePriceStoreTx(ownerAccount.addr,
      assetMap.map(v => { return { asaid: v.assetId!, slot: 0 } }),
      txParams.payload,
      params)

    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    const txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')

    for (const [i, v] of assetMap.entries()) {
      const priceData = await getGlobalPriceSlot(i)
      expect(priceData.readBigInt64BE(0)).to.deep.equal(BigInt(v.assetId!))
    }
    await deleteAssets(assetMap)
  })

  it('Must handle five attestations at indices 0-4 with enough opcode budget', async function () {
    const assetMap = [
      { decimals: 5, assetId: undefined, samplePrice: 10000, exponent: -8 },
      { decimals: 6, assetId: undefined, samplePrice: 10000, exponent: -7 },
      { decimals: 7, assetId: undefined, samplePrice: 10000, exponent: -6 },
      { decimals: 8, assetId: undefined, samplePrice: 10000, exponent: -5 },
      { decimals: 3, assetId: undefined, samplePrice: 10000, exponent: -4 }
    ]

    await createAssets(assetMap)
    const txParams = prepareStoreTxParameters(assetMap)

    const params = await algodClient.getTransactionParams().do()
    params.fee = 4000

    const tx = pclib.makePriceStoreTx(ownerAccount.addr,
      assetMap.map((v, i) => { return { asaid: v.assetId!, slot: i } }),
      txParams.payload,
      params)

    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    const txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')

    for (const [i, v] of assetMap.entries()) {
      const priceData = await getGlobalPriceSlot(i)
      expect(priceData.readBigInt64BE(0)).to.deep.equal(BigInt(v.assetId!))
    }
    await deleteAssets(assetMap)
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
