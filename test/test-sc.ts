/* eslint-disable no-unused-expressions */
import PricecasterLib, { PRICECASTER_CI, PriceSlotData } from '../lib/pricecaster'
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
type AssetMapEntry = { decimals: number, assetId: number | undefined, samplePrice: number, exponent: number, slot: number | undefined }
const asaInSlot = Array(62).fill(0)

const assetMap1 = [
  { decimals: 5, assetId: undefined, samplePrice: 10000, exponent: -8, slot: undefined },
  { decimals: 6, assetId: undefined, samplePrice: 10000, exponent: -7, slot: undefined },
  { decimals: 7, assetId: undefined, samplePrice: 10000, exponent: -6, slot: undefined },
  { decimals: 8, assetId: undefined, samplePrice: 10000, exponent: -5, slot: undefined },
  { decimals: 3, assetId: undefined, samplePrice: 10000, exponent: -4, slot: undefined }
]

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
  const txId = await pclib.createPricecasterApp(ownerAccount.addr, coreId, signCallback, 2000)
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

function prepareStoreTxArgs (assetMap: AssetMapEntry[],
  statusByte: string = '01',
  pubtime_: string = '000000006283efc3'): { payload: Buffer, flatU8ArrayAssetIds: Uint8Array, assetIds: number[]} {
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
    const stat = Buffer.from(statusByte, 'hex')
    const numpub = Buffer.from('00000004', 'hex')
    const maxnumpub = Buffer.from('00000006', 'hex')
    const time = Buffer.from('000000006283efc2', 'hex')
    const pubtime = Buffer.from(pubtime_, 'hex')
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
    await deleteAsset(asset.index)
  }
}

async function sendPriceStoreTx (assetMap: AssetMapEntry[], txParams: any) {
  const params = await algodClient.getTransactionParams().do()
  params.fee = 2000

  const tx = pclib.makePriceStoreTx(ownerAccount.addr,
    assetMap.map((v, i) => { return { asaid: v.assetId!, slot: v.slot! } }),
    txParams.payload,
    params)

  const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
  return await pclib.waitForTransactionResponse(txId)
}

async function sendAllocSlotTx (assetId: number) {
  const params = await algodClient.getTransactionParams().do()
  params.fee = 1000

  const tx = pclib.makeAllocSlotTx(ownerAccount.addr, assetId, params)
  const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
  return await pclib.waitForTransactionResponse(txId)
}

async function testOkCase (decimals: number,
  samplePrice: number,
  exponent: number,
  assetIdOverride?: number): Promise<PriceSlotData> {
  const assetMap = [
    { decimals, assetId: assetIdOverride, samplePrice, exponent, slot: -1 }
  ]

  await createAssets(assetMap)
  const txResponse = await sendAllocSlotTx(assetMap[0].assetId!)
  assetMap[0].slot = Number(txResponse.logs[0].readBigUInt64BE(6))

  const txParams = prepareStoreTxArgs(assetMap)
  const txResponse2 = await sendPriceStoreTx(assetMap, txParams)
  expect(txResponse2['pool-error']).to.equal('')

  const dataBuf = await pclib.readSlot(assetMap[0].slot)
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
  sender: Account = ownerAccount,
  failedLine?: number) {
  const assetMap = [
    { decimals, assetId: assetIdOverride, samplePrice, exponent, slot: undefined }
  ]

  await createAssets(assetMap)
  const txParams = prepareStoreTxArgs(assetMap)

  const params = await algodClient.getTransactionParams().do()
  params.fee = 2000
  const tx = pclib.makePriceStoreTx(sender.addr,
    assetMap.map((v, i) => { return { asaid: v.assetId!, slot: i } }),
    txParams.payload,
    params)

  const regex = new RegExp(failedLine ? `logic eval error.*opcodes=pushint ${failedLine}` : 'logic eval error')

  await expect(algodClient.sendRawTransaction(tx.signTxn(sender.sk)).do()).to.be.rejectedWith(regex)

  if (!assetIdOverride) {
    deleteAssets(assetMap)
  }
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
    // await deleteAllAssets()
  })

  it('Must fail to call store without Testing bit set', async function () {
    await testFailCase(19, 1, 0, 50000000, undefined, 351)
  })

  it('Must fail to call setflags from non-creator account', async function () {
    const altAccount = generateAccount()
    const paymentTx = makePaymentTxnWithSuggestedParams(ownerAccount.addr, altAccount.addr, 400000, undefined, undefined, await algodClient.getTransactionParams().do())
    const params = await algodClient.getTransactionParams().do()
    const paymentTxId = await algodClient.sendRawTransaction(paymentTx.signTxn(ownerAccount.sk)).do()

    await algosdk.waitForConfirmation(algodClient, paymentTxId.txId, 4)
    const tx = pclib.makeSetFlagsTx(altAccount.addr, 128, params)
    // eslint-disable-next-line prefer-regex-literals
    const regex = new RegExp('logic eval error.*opcodes=pushint 454')
    await expect(algodClient.sendRawTransaction(tx.signTxn(altAccount.sk)).do()).to.be.rejectedWith(regex)
  })

  it('Must set setflags (testmode) by operator', async function () {
    const params = await algodClient.getTransactionParams().do()
    const tx = pclib.makeSetFlagsTx(ownerAccount.addr, 128, params)
    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    const txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')
  })

  it('Must ignore payload with status != 1 and log message', async function () {
    const assetMap = [
      { decimals: 5, assetId: undefined, samplePrice: 10000, exponent: -8, slot: undefined }
    ]

    await createAssets(assetMap)
    const txParams = prepareStoreTxArgs(assetMap, '00')
    const params = await algodClient.getTransactionParams().do()
    params.fee = 2000
    params.flatFee = true

    const tx = pclib.makePriceStoreTx(ownerAccount.addr,
      assetMap.map(v => { return { asaid: v.assetId!, slot: 0 } }),
      txParams.payload,
      params)

    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    const txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')
    expect(txResponse.logs[0]).to.deep.equal(Buffer.concat([Buffer.from('PRICE_DISABLED:'), Buffer.from(algosdk.encodeUint64(txParams.assetIds[0]))]))

    await deleteAssets(assetMap)
  })

  it('Must fail to store unallocated slot 0', async function () {
    await testFailCase(19, 1, 0, 0, undefined, 250)
  })

  it('Must succeed to allocate slot 0 for new ASA ID', async function () {
    const assetMap = [
      { decimals: 5, assetId: undefined, samplePrice: 10000, exponent: -8, slot: undefined }
    ]

    await createAssets(assetMap)
    const txResponse = await sendAllocSlotTx(assetMap[0].assetId!)
    expect(txResponse['pool-error']).to.equal('')

    const ec = (await pclib.readSystemSlot()).entryCount
    expect(txResponse.logs[0]).to.deep.equal(Buffer.concat([Buffer.from('ALLOC@'), Buffer.from(algosdk.encodeUint64(ec - 1))]))

    asaInSlot[0] = assetMap[0].assetId!
  })

  it('Must fail to store data in incorrect slot', async function () {
    await testFailCase(19, 1, 0, 85000000, undefined, 406)
  })

  it('Must handle one attestation at index 0 with enough opcode budget', async function () {
    const assetMap = [
      { decimals: 5, assetId: asaInSlot[0], samplePrice: 10000, exponent: -8, slot: undefined }
    ]

    const txParams = prepareStoreTxArgs(assetMap)

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
      const priceData = await pclib.readSlot(i)
      expect(priceData.readBigInt64BE(0)).to.deep.equal(BigInt(v.assetId!))
    }
  })

  it('Must allocate five additional slots', async function () {
    await createAssets(assetMap1)

    const params = await algodClient.getTransactionParams().do()
    params.fee = 1000

    for (const asset of assetMap1) {
      const tx = pclib.makeAllocSlotTx(ownerAccount.addr, asset.assetId!, params)
      const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
      const txResponse = await pclib.waitForTransactionResponse(txId)
      expect(txResponse['pool-error']).to.equal('')

      const ec = (await pclib.readSystemSlot()).entryCount
      expect(txResponse.logs[0]).to.deep.equal(Buffer.concat([Buffer.from('ALLOC@'), Buffer.from(algosdk.encodeUint64(ec - 1))]))
      asset.slot = txResponse.logs[0].readBigUInt64BE(6)
    }
  })

  it('Must handle five attestations at indices 0-4 with enough opcode budget', async function () {
    const txParams = prepareStoreTxArgs(assetMap1)

    const params = await algodClient.getTransactionParams().do()
    params.fee = 7000

    const tx = pclib.makePriceStoreTx(ownerAccount.addr,
      assetMap1.map((v, i) => { return { asaid: v.assetId!, slot: v.slot! } }),
      txParams.payload,
      params)

    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    const txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')

    for (const [i, v] of assetMap1.entries()) {
      const priceData = await pclib.readSlot(Number(v.slot!))
      expect(priceData.readBigInt64BE(0)).to.deep.equal(BigInt(v.assetId!))
    }
    await deleteAssets(assetMap1)
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

  it('Must fail to publish when VAA attestations and ASA ID argument count differ', async function () {
    const txParams = prepareStoreTxArgs(assetMap1)
    const params = await algodClient.getTransactionParams().do()
    params.fee = 7000

    // There are five assets in payload, but only one Asset ID as argument to makeStoretx

    const tx = pclib.makePriceStoreTx(ownerAccount.addr,
      [{ asaid: assetMap1[0].assetId!, slot: assetMap1[0].slot! }],
      txParams.payload,
      params)

    // eslint-disable-next-line prefer-regex-literals
    const regex = new RegExp('logic eval error.*opcodes=pushint 375')
    await expect(algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()).to.be.rejectedWith(regex)
  })

  it('Must ignore publication where an attestation has older publish time', async function () {
    const assetMap = [
      { decimals: 5, assetId: asaInSlot[0], samplePrice: 10000, exponent: -8, slot: 0 }
    ]

    await createAssets(assetMap)
    let txParams = prepareStoreTxArgs(assetMap)
    const params = await algodClient.getTransactionParams().do()
    params.fee = 7000

    let tx = pclib.makePriceStoreTx(ownerAccount.addr,
      [{ asaid: assetMap[0].assetId!, slot: assetMap[0].slot! }],
      txParams.payload,
      params)

    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    let txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')

    // Set a very old time. This must be ignored since a newer previous price is already set.
    txParams = prepareStoreTxArgs(assetMap, '01', '0000000000000001')

    tx = pclib.makePriceStoreTx(ownerAccount.addr,
      [{ asaid: assetMap[0].assetId!, slot: assetMap[0].slot! }],
      txParams.payload,
      params)

    {
      const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
      txResponse = await pclib.waitForTransactionResponse(txId)
      expect(txResponse['pool-error']).to.equal('')

      expect(txResponse.logs[0]).to.deep.equal(Buffer.concat([Buffer.from('PRICE_IGNORED_OLD:'), Buffer.from(algosdk.encodeUint64(txParams.assetIds[0]))]))
    }
  })

  it('Must zero contract with reset call', async function () {
    const params = await algodClient.getTransactionParams().do()
    params.fee = 2000

    const tx = pclib.makeResetTx(ownerAccount.addr, params)

    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    const txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')

    const global = await pclib.fetchGlobalSpace()
    expect(global).to.deep.equal(Buffer.alloc(127 * 63))
  })

  it('Must fail to store from non-creator account', async function () {
    const altAccount = generateAccount()
    const paymentTx = makePaymentTxnWithSuggestedParams(ownerAccount.addr, altAccount.addr, 400000, undefined, undefined, await algodClient.getTransactionParams().do())
    const paymentTxId = await algodClient.sendRawTransaction(paymentTx.signTxn(ownerAccount.sk)).do()
    await algosdk.waitForConfirmation(algodClient, paymentTxId.txId, 4)
    await testFailCase(4, 1, -8, undefined, altAccount)
  })
})
