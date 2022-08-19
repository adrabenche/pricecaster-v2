/* eslint-disable no-unused-expressions */
import PricecasterLib, { PRICECASTER_CI } from '../lib/pricecaster'
import tools from '../tools/app-tools'
import algosdk, { Transaction } from 'algosdk'
import appTools from '../tools/app-tools'
const { expect } = require('chai')
const chai = require('chai')
const spawnSync = require('child_process').spawnSync
const testConfig = require('./test-config')
chai.use(require('chai-as-promised'))
// import WormholeAlgoSdk from 'wormhole/sdk/js/src/token_bridge/Algorand'

let pclib: PricecasterLib
let algodClient: algosdk.Algodv2
let ownerAccount: algosdk.Account
let pkAppId: number
type AssetMapEntry = { decimals: number, assetId: number | undefined, sample_price: number, exponent: number }

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

function prepareTxParameters (assetMap: AssetMapEntry[]): { payload: Buffer, flatU8ArrayAssetIds: Uint8Array, assetIds: number[] } {
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
    price.writeBigUInt64BE(BigInt(val.sample_price))
    const conf = Buffer.from('00000000000000ff', 'hex')
    const exp = Buffer.alloc(4)
    exp.writeInt32BE(val.exponent)
    const ema = Buffer.from('00000000000000ff00000000000000ff', 'hex')
    const stat = Buffer.from('01', 'hex')
    const numpub = Buffer.from('00000004', 'hex')
    const maxnumpub = Buffer.from('00000004', 'hex')
    const time = Buffer.from('000000006283efc2', 'hex')
    const pubtime = Buffer.from('000000006283efc2', 'hex')
    const remfields = Buffer.from('000000006283efc200000000008823d60000000000004be2', 'hex')

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
    if (assetMap[i].assetId !== 0) {
      assetMap[i].assetId = await createAsset(val.decimals)
    }
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
    console.log('    - [Created pricecaster appId: %d]', pkAppId)

    const thisCoreId = await tools.readAppGlobalStateByKey(algodClient, PRICECASTER_CI.appId, ownerAccount.addr, 'coreid')
    expect(thisCoreId).to.equal(dummyCoreId)
  })

  after(async function () {
    await pclib.deleteApp(ownerAccount.addr, signCallback, PRICECASTER_CI)
  })

  it('Must process Pyth payload with attestations', async function () {
    const assetMap = [
      //
      // Decimals are how many digits after the decimal point is used in representing units of the asset.
      // Exponent is the place where the decimal point must be set to interpret price as real-value
      //   (for example if exp =-8, price = P * (10^-8))
      //
      { decimals: 9, assetId: undefined, sample_price: 600_000_000, exponent: -3 },
      { decimals: 8, assetId: undefined, sample_price: 75_854_260_000, exponent: -8 },
      { decimals: 19, assetId: undefined, sample_price: 9_000_000_000_000_000, exponent: -8 },
      { decimals: 0, assetId: undefined, sample_price: 400050, exponent: -12 },
      { decimals: -1, assetId: 0, sample_price: 1_540_000_000, exponent: -8 } // ALGO-like, contract should set correct decimals
    ]

    await createAssets(assetMap)
    const txParams = prepareTxParameters(assetMap)
    // console.log(txParams.payload.toString('hex'))

    const tx = await pclib.makePriceStoreTx(ownerAccount.addr,
      txParams.flatU8ArrayAssetIds,
      txParams.assetIds,
      txParams.payload)

    const { txId } = await algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()
    const txResponse = await pclib.waitForTransactionResponse(txId)
    expect(txResponse['pool-error']).to.equal('')

    for (const asset of assetMap) {
      const data = await appTools.readAppGlobalStateByKey(algodClient, pclib.getAppId(PRICECASTER_CI), ownerAccount.addr, asset.assetId!)
      expect(data).not.to.be.undefined

      // const storedPrice = Buffer.from(data!, 'base64').subarray(0, 8).readBigUint64BE()
      // expect(storedPrice).to.equal(BigInt(Math.round(asset.sample_price * Math.pow(10, (12 + asset.exponent - (asset.decimals === -1 ? 6 : asset.decimals))))))
    }
  })

  it('Must fail if (decimals + exp < 12)', async function () {
    const assetMap = [
      { decimals: 3, assetId: 0, sample_price: 600_000_000, exponent: -3 }
    ]

    createAssets(assetMap)
    const txParams = prepareTxParameters(assetMap)

    const tx = await pclib.makePriceStoreTx(ownerAccount.addr,
      txParams.flatU8ArrayAssetIds,
      txParams.assetIds,
      txParams.payload)

    await expect(algodClient.sendRawTransaction(tx.signTxn(ownerAccount.sk)).do()).to.be.rejectedWith(/opcodes=pushint 240/)
  })
})
