/* eslint-disable no-unused-expressions */
const PricecasterLib = require('../lib/pricecaster')
const tools = require('../tools/app-tools')
const algosdk = require('algosdk')
const { expect } = require('chai')
const chai = require('chai')
const spawnSync = require('child_process').spawnSync
const fs = require('fs')
const TestLib = require('./testlib.js')
const { makePaymentTxnWithSuggestedParams } = require('algosdk')
const testConfig = require('./test-config')
const { extract3, arrayChunks } = require('../tools/app-tools')
const { CORE_CONTRACT_ID } = require('./test-config')
chai.use(require('chai-as-promised'))
const testLib = new TestLib.TestLib()

let pclib
let algodClient
let verifyProgramHash
let compiledVerifyProgram
let ownerAddr, otherAddr
let pkAppId

const signatures = {}

const guardianKeys = [
  '52A26Ce40F8CAa8D36155d37ef0D5D783fc614d2',
  '389A74E8FFa224aeAD0778c786163a7A2150768C',
  'B4459EA6482D4aE574305B239B4f2264239e7599',
  '072491bd66F63356090C11Aae8114F5372aBf12B',
  '51280eA1fd2B0A1c76Ae29a7d54dda68860A2bfF',
  'fa9Aa60CfF05e20E2CcAA784eE89A0A16C2057CB',
  'e42d59F8FCd86a1c5c4bA351bD251A5c5B05DF6A',
  '4B07fF9D5cE1A6ed58b6e9e7d6974d1baBEc087e',
  'c8306B84235D7b0478c61783C50F990bfC44cFc0',
  'C8C1035110a13fe788259A4148F871b52bAbcb1B',
  '58A2508A20A7198E131503ce26bBE119aA8c62b2',
  '8390820f04ddA22AFe03be1c3bb10f4ba6CF94A0',
  '1FD6e97387C34a1F36DE0f8341E9D409E06ec45b',
  '255a41fC2792209CB998A8287204D40996df9E54',
  'bA663B12DD23fbF4FbAC618Be140727986B3BBd0',
  '79040E577aC50486d0F6930e160A5C75FD1203C6',
  '3580D2F00309A9A85efFAf02564Fc183C0183A96',
  '3869795913D3B6dBF3B24a1C7654672c69A23c35',
  '1c0Cc52D7673c52DE99785741344662F5b2308a0'

]
const guardianPrivKeys = [
  '563d8d2fd4e701901d3846dee7ae7a92c18f1975195264d676f8407ac5976757',
  '8d97f25916a755df1d9ef74eb4dbebc5f868cb07830527731e94478cdc2b9d5f',
  '9bd728ad7617c05c31382053b57658d4a8125684c0098f740a054d87ddc0e93b',
  '5a02c4cd110d20a83a7ce8d1a2b2ae5df252b4e5f6781c7855db5cc28ed2d1b4',
  '93d4e3b443bf11f99a00901222c032bd5f63cf73fc1bcfa40829824d121be9b2',
  'ea40e40c63c6ff155230da64a2c44fcd1f1c9e50cacb752c230f77771ce1d856',
  '87eaabe9c27a82198e618bca20f48f9679c0f239948dbd094005e262da33fe6a',
  '61ffed2bff38648a6d36d6ed560b741b1ca53d45391441124f27e1e48ca04770',
  'bd12a242c6da318fef8f98002efb98efbf434218a78730a197d981bebaee826e',
  '20d3597bb16525b6d09e5fb56feb91b053d961ab156f4807e37d980f50e71aff',
  '344b313ffbc0199ff6ca08cacdaf5dc1d85221e2f2dc156a84245bd49b981673',
  '848b93264edd3f1a521274ca4da4632989eb5303fd15b14e5ec6bcaa91172b05',
  'c6f2046c1e6c172497fc23bd362104e2f4460d0f61984938fa16ef43f27d93f6',
  '693b256b1ee6b6fb353ba23274280e7166ab3be8c23c203cc76d716ba4bc32bf',
  '13c41508c0da03018d61427910b9922345ced25e2bbce50652e939ee6e5ea56d',
  '460ee0ee403be7a4f1eb1c63dd1edaa815fbaa6cf0cf2344dcba4a8acf9aca74',
  'b25148579b99b18c8994b0b86e4dd586975a78fa6e7ad6ec89478d7fbafd2683',
  '90d7ac6a82166c908b8cf1b352f3c9340a8d1f2907d7146fb7cd6354a5436cca',
  'b71d23908e4cf5d6cd973394f3a4b6b164eb1065785feee612efdfd8d30005ed'
]

const PYTH_EMITTER = '0xf346195ac02f37d60d4db8ffa6ef74cb1be3550047543a4a9ee9acf4d78697b0'
// const OTHER_PYTH_EMITTER = '0x0000000000000000000000000000000000000000000000000000000000000001'
// const PYTH_PAYLOAD = '0x50325748000101230abfe0ec3b460bd55fc4fb36356716329915145497202b8eb8bf1af6a0a3b9fe650f0367d4a7ef9815a593ea15d36593f0643aaaf0149bb04be67ab851decd010000002f17254388fffffff70000002eed73d9000000000070d3b43f0000000037faa03d000000000e9e555100000000894af11c0000000037faa03d000000000dda6eb801000000000061a5ff9a'
// const OTHER_PAYLOAD = '0xf0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0'
const PYTH_ATTESTATION_V2_BYTES = 150

// --------------------------------------------------------------------------
// Utility functions
// --------------------------------------------------------------------------

function parseVAA (vaa) {
  const ret = new Map()
  const buf = Buffer.from(vaa)
  ret.set('version', buf.readIntBE(0, 1))
  ret.set('index', buf.readIntBE(1, 4))
  ret.set('siglen', buf.readIntBE(5, 1))
  const siglen = ret.get('siglen')
  if (siglen) {
    ret.set('signatures', extract3(vaa, 6, siglen * 66))
  }
  const sigs = []
  for (let i = 0; i < siglen; i++) {
    // TODO:  finish figuring this out.
    const start = 6 + i * 66
    const len = 66
    const sigBuf = extract3(vaa, start, len)
    sigs.push(sigBuf)
    // ret["sigs"].append(vaa[(6 + (i * 66)):(6 + (i * 66)) + 66].hex())
  }
  ret.set('sigs', sigs)
  let off = siglen * 66 + 6
  ret.set('digest', vaa.slice(off)) // This is what is actually signed...
  ret.set('timestamp', buf.readIntBE(off, 4))
  off += 4
  ret.set('nonce', buf.readIntBE(off, 4))
  off += 4
  ret.set('chainRaw', extract3(vaa, off, 2))
  ret.set('chain', buf.readIntBE(off, 2))
  off += 2
  ret.set('emitter', extract3(vaa, off, 32))
  off += 32
  ret.set('sequence', buf.readBigInt64BE(off))
  off += 8
  ret.set('consistency', buf.readIntBE(off, 1))
  off += 1

  ret.set('Meta', 'Unknown')

  if (
    Buffer.from(vaa, off, 32) ===
      Buffer.from(
        '000000000000000000000000000000000000000000546f6b656e427269646765'
      )
  ) {
    ret.set('Meta', 'TokenBridge')
    ret.set('module', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('action', buf.readIntBE(off, 1))
    off += 1
    if (ret.get('action') === 1) {
      ret.set('Meta', 'TokenBridge RegisterChain')
      ret.set('targetChain', buf.readIntBE(off, 2))
      off += 2
      ret.set('EmitterChainID', buf.readIntBE(off, 2))
      off += 2
      ret.set('targetEmitter', Buffer.from(vaa, off, 32))
      off += 32
    } else if (ret.get('action') === 2) {
      ret.set('Meta', 'TokenBridge UpgradeContract')
      ret.set('targetChain', buf.readIntBE(off, 2))
      off += 2
      ret.set('newContract', Buffer.from(vaa, off, 32))
      off += 32
    }
  }

  if (
    Buffer.from(vaa, off, 32) ===
      Buffer.from(
        '00000000000000000000000000000000000000000000000000000000436f7265'
      )
  ) {
    ret.set('Meta', 'CoreGovernance')
    ret.set('module', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('action', buf.readIntBE(off, 1))
    off += 1
    ret.set('targetChain', buf.readIntBE(off, 2))
    off += 2
    ret.set('NewGuardianSetIndex', buf.readIntBE(off, 4))
  }
  if (Buffer.from(vaa, off).length === 100 && buf.readIntBE(off, 1) === 2) {
    ret.set('Meta', 'TokenBridge Attest')
    ret.set('Type', buf.readIntBE(off, 1))
    off += 1
    ret.set('Contract', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('FromChain', buf.readIntBE(off, 2))
    off += 2
    ret.set('Decimals', buf.readIntBE(off, 1))
    off += 1
    ret.set('Symbol', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('Name', Buffer.from(vaa, off, 32))
  }

  if (Buffer.from(vaa, off).length === 133 && buf.readIntBE(off, 1) === 1) {
    ret.set('Meta', 'TokenBridge Transfer')
    ret.set('Type', buf.readIntBE(off, 1))
    off += 1
    ret.set('Amount', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('Contract', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('FromChain', buf.readIntBE(off, 2))
    off += 2
    ret.set('ToAddress', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('ToChain', buf.readIntBE(off, 2))
    off += 2
    ret.set('Fee', Buffer.from(vaa, off, 32))
  }

  if (buf.readIntBE(off, 1) === 3) {
    ret.set('Meta', 'TokenBridge Transfer With Payload')
    ret.set('Type', buf.readIntBE(off, 1))
    off += 1
    ret.set('Amount', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('Contract', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('FromChain', buf.readIntBE(off, 2))
    off += 2
    ret.set('ToAddress', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('ToChain', buf.readIntBE(off, 2))
    off += 2
    ret.set('Fee', Buffer.from(vaa, off, 32))
    off += 32
    ret.set('Payload', Buffer.from(vaa, off))
  }

  return ret
}

async function createPricecasterApp (vaaProcessorAppid) {
  const txId = await pclib.createPricecasterApp(ownerAddr, vaaProcessorAppid, signCallback)
  const txResponse = await pclib.waitForTransactionResponse(txId)
  const appId = pclib.appIdFromCreateAppResponse(txResponse)
  pclib.setAppId('pricecaster', appId)
  return appId
}

function signCallback (sender, tx) {
  const txSigned = tx.signTxn(signatures[sender])
  return txSigned
}

async function getTxParams () {
  const params = await algodClient.getTransactionParams().do()
  params.fee = 1000
  params.flatFee = true
  return params
}

async function buildTransactionGroup2 (vaa) {
  const MAX_BITS = 127 * 16 * 8
  let program = fs.readFileSync('sig.tmpl.teal', 'utf8')
  const parsedVaa = parseVAA(Buffer.from(vaa.vaa, 'hex'))

  program = program.replace(/TMPL_ADDR_IDX/, (parsedVaa.get('sequence') / BigInt(MAX_BITS)).toString())
  program = program.replace(/TMPL_EMITTER_ID/, parsedVaa.get('chainRaw').toString('hex') + parsedVaa.get('emitter').toString('hex'))
  program = program.replace(/TMPL_SEED_AMT/, 1002000)
  program = program.replace(/TMPL_APP_ID/, testConfig.CORE_CONTRACT_ID)
  program = program.replace(/TMPL_APP_ADDRESS/, algosdk.getApplicationAddress(BigInt(testConfig.CORE_CONTRACT_ID)))

  console.log(program.toString())
  //await pclib.compileProgram(program)
}

/**
 * @param {*} numOfVerifySteps Number of verify steps.
 * @param {*} stepSize How many signatures are verified per step.
 * @param {*} guardianKeys A collection of guardian keys.
 * @param {*} guardianCount The total guardian count.
 * @param {*} signatures The signature set for verification.
 * @param {*} vaaBody An hex encoded string containing the VAA body.
 * @param {*} fee The tx fees.
 * @param {*} sender The tx sender.
 * @param {*} addVerifyTxCallback An optional callback to add each verify TX to group
 * @param {*} addLastTxCallback An optional callback to add the last TX call
 */
async function buildTransactionGroup (numOfVerifySteps, stepSize, guardianKeys, guardianCount,
  signatures, vaaBody, fee, sender, addVerifyTxCallback, addLastTxCallback) {
  const params = await getTxParams()
  if (fee !== undefined) {
    params.fee = fee
  }
  const senderAddress = sender !== undefined ? sender : verifyProgramHash
  const addVerifyCallbackFn = addVerifyTxCallback !== undefined ? addVerifyTxCallback : pclib.addVerifyTx.bind(pclib)
  const addLastTxCallbackFn = addLastTxCallback !== undefined ? addLastTxCallback : pclib.addPriceStoreTx.bind(pclib)

  // Fill remaining signatures with dummy ones for cases where not all guardians may sign.

  const numOfSigs = signatures.length / 132
  const remaining = guardianCount - numOfSigs
  if (remaining > 0) {
    for (let i = guardianCount - remaining; i < guardianCount; ++i) {
      signatures += i.toString(16).padStart(2, '0') + ('0'.repeat(130))
    }
  }

  const keyChunks = arrayChunks(guardianKeys, stepSize)
  const sigChunks = arrayChunks(signatures, stepSize * 132)

  const gid = pclib.beginTxGroup()
  for (let i = 0; i < numOfVerifySteps; i++) {
    addVerifyCallbackFn(gid, senderAddress, params, vaaBody, keyChunks[i], guardianCount)
  }

  addLastTxCallbackFn(gid, ownerAddr, params, payloadFromVAABody(vaaBody))
  const tx = await pclib.commitVerifyTxGroup(gid, compiledVerifyProgram.bytes, numOfSigs, sigChunks, ownerAddr, signCallback)
  return tx
}

/**
 *
 * @param {string} vaaBody Hex-encoded VAA body.
 * @returns The payload part of the VAA.
 */
function payloadFromVAABody (vaaBody) {
  return vaaBody.slice(51 * 2)
}

async function createTestAccounts () {
  let acc = algosdk.generateAccount()
  ownerAddr = acc.addr
  signatures[ownerAddr] = acc.sk
  acc = algosdk.generateAccount()
  otherAddr = acc.addr
  signatures[otherAddr] = acc.sk
  signatures[testConfig.SOURCE_ACCOUNT] = algosdk.mnemonicToSecretKey(testConfig.SOURCE_MNEMO).sk

  const parms = await getTxParams()
  const tx = makePaymentTxnWithSuggestedParams(testConfig.SOURCE_ACCOUNT, ownerAddr, 5000000, undefined, undefined, parms)
  const signedTx = signCallback(testConfig.SOURCE_ACCOUNT, tx)
  await algodClient.sendRawTransaction(signedTx).do()
  await pclib.waitForTransactionResponse(tx.txID().toString())

  const tx2 = makePaymentTxnWithSuggestedParams(testConfig.SOURCE_ACCOUNT, otherAddr, 100000, undefined, undefined, parms)
  const signedTx2 = signCallback(testConfig.SOURCE_ACCOUNT, tx2)
  await algodClient.sendRawTransaction(signedTx2).do()
  await pclib.waitForTransactionResponse(tx2.txID().toString())
}

async function clearApps () {
  console.log('Clearing accounts of all previous apps...')
  const appsTo = await tools.readCreatedApps(algodClient, ownerAddr)
  for (let i = 0; i < appsTo.length; i++) {
    console.log('Clearing ' + appsTo[i].id)
    try {
      const txId = await pclib.deleteApp(ownerAddr, signCallback, appsTo[i].id)
      await pclib.waitForConfirmation(txId)
    } catch (e) {
      console.error('Could not delete application! Reason: ' + e)
    }
  }
}

function setupPricecasterLib (dumpFailedTx) {
  // const vaaProcessorClearState = 'test/temp/vaa-clear-state.teal'
  // const vaaProcessorApproval = 'test/temp/vaa-processor.teal'
  const pricecasterApproval = 'test/temp/pricecaster-v2.teal'
  const pricecasterClearState = 'test/temp/pricecaster-clear-state.teal'

  // pclib.setApprovalProgramFile('vaaProcessor', vaaProcessorApproval)
  pclib.setApprovalProgramFile('pricecaster', pricecasterApproval)
  // pclib.setClearStateProgramFile('vaaProcessor', vaaProcessorClearState)
  pclib.setClearStateProgramFile('pricecaster', pricecasterClearState)

  pclib.enableDumpFailedTx(dumpFailedTx)
  pclib.setDumpFailedTxDirectory('./test/temp')

  // console.log(spawnSync('python', ['teal/wormhole/pyteal/vaa-processor.py', vaaProcessorApproval, vaaProcessorClearState]).output.toString())
  console.log(spawnSync('python', ['teal/pyteal/pricecaster-v2.py', pricecasterApproval, pricecasterClearState]).output.toString())
  console.log(spawnSync('python', ['wormhole/algorand/tmplSig.py']).output.toString())
}

function createVAA (guardianSetIndex, guardianPrivKeys, pythChainId, pythEmitterAddress, numAttest) {
  const vaa = testLib.createSignedPythVAA(guardianSetIndex, guardianPrivKeys, pythChainId, pythEmitterAddress, numAttest)
  const body = vaa.substr(12 + guardianPrivKeys.length * 132)
  const signatures = vaa.substr(12, guardianPrivKeys.length * 132)

  return {
    vaa,
    body,
    signatures
  }
}

function getAttestation (payload, index) {
  return extract3(payload, 11 + (PYTH_ATTESTATION_V2_BYTES * index), PYTH_ATTESTATION_V2_BYTES)
}

// eslint-disable-next-line no-unused-vars
function getAttestationKey (payload, index) {
  return extract3(getAttestation(payload, index), 7, 64)
}

/**
 * Check attestations in a payload vs. the stored state
 * @param {*} vaa The VAA to check
 * @param {*} numOfAttest  Number of attestations to check
 */
async function checkAttestations (vaa, numOfAttest) {
  let state = await tools.readAppGlobalState(algodClient, pkAppId, ownerAddr)
  const payloadAttestations = Buffer.from(payloadFromVAABody(vaa.body), 'hex')

  // filter out vappid, sort keys.
  state = state.filter(x => Buffer.from(x.key, 'base64').toString() !== 'vaapid')
  state.sort((a, b) => {
    if (a.key > b.key) {
      return 1
    }
    if (a.key < b.key) {
      return -1
    }
    return 0
  })

  // console.log(state)
  let sortedAttestations = []
  for (let i = 0; i < numOfAttest; i++) {
    sortedAttestations.push(getAttestation(payloadAttestations, i))
  }

  sortedAttestations = sortedAttestations.sort((a, b) => {
    if (extract3(a, 7, 64).toString('hex') > extract3(b, 7, 64).toString('hex')) {
      return 1
    }
    if (extract3(a, 7, 64).toString('hex') < extract3(b, 7, 64).toString('hex')) {
      return -1
    }
    return 0
  })

  // console.log(sortedAttestations)
  expect(sortedAttestations.length).to.equal(state.length)

  for (let i = 0; i < numOfAttest; i++) {
    // Check product-price key
    const sk = Buffer.from(state[i].key, 'base64').toString('hex')
    const sv = Buffer.from(state[i].value.bytes, 'base64')

    expect(sk).to.equal(extract3(sortedAttestations[i], 7, 64).toString('hex'))

    // Check price + exponent + twap
    expect(extract3(sv, 0, 20)).to.deep.equal(extract3(sortedAttestations[i], 72, 20))

    // Check twac
    expect(extract3(sv, 20, 8)).to.deep.equal(extract3(sortedAttestations[i], 108, 8))

    // Check confidence + status + timestamp
    expect(extract3(sv, 28, 18)).to.deep.equal(extract3(sortedAttestations[i], 132, 18))
  }
}

// ===============================================================================================================
//
// Test suite starts here
//
// ===============================================================================================================

describe('Pricecaster System Tests', function () {
  before(async function () {
    algodClient = new algosdk.Algodv2(testConfig.ALGORAND_NODE_TOKEN, testConfig.ALGORAND_NODE_HOST, testConfig.ALGORAND_NODE_PORT)
    pclib = new PricecasterLib.PricecasterLib(algodClient)

    await createTestAccounts()

    console.log('\n  Test accounts: \n    - OWNER: ' + ownerAddr)
    console.log('    - OTHER: ' + otherAddr)
    console.log('\n  Funding accounts from ' + testConfig.SOURCE_ACCOUNT)

    const ownerAccInfo = await algodClient.accountInformation(ownerAddr).do()
    expect(ownerAccInfo.amount).to.be.at.least(algosdk.algosToMicroalgos(5), 'Owner must have enough funding (1 ALGO) to run tests')

    await clearApps()

    setupPricecasterLib(testConfig.DUMP_FAILED_TX)
  }
  )

  // it('Must fail to create app with incorrect guardian keys length', async function () {
  //   const gsexptime = 2524618800
  //   await expect(createVaaProcessorApp(gsexptime, 0, ['BADADDRESS'])).to.be.rejectedWith(/logic eval error/g)
  // })

  // it('Must create VAA Processor app with initial guardians and proper initial state', async function () {
  //   const gsexptime = 2524618800
  //   appId = await createVaaProcessorApp(gsexptime, 0, guardianKeys)
  //   console.log('    - [Created VAA Processor appId: %d]', appId)

  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const gsexp = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gsexp')
  //   expect(gscount.toString()).to.equal((guardianKeys.length).toString())
  //   expect(gsexp.toString()).to.equal(gsexptime.toString())

  //   let i = 0
  //   const buf = Buffer.alloc(8)
  //   for (const gk of guardianKeys) {
  //     buf.writeBigUint64BE(BigInt(i++))
  //     const gkstate = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, buf.toString())
  //     expect(Buffer.from(gkstate, 'base64').toString('hex')).to.equal(gk.toLowerCase())
  //   }
  // })

  it('Must create pricecaster V2 app with VAA Processor app id set', async function () {
    pkAppId = await createPricecasterApp(testConfig.CORE_CONTRACT_ID)
    console.log('    - [Created pricecaster appId: %d]', pkAppId)

    const coreid = await tools.readAppGlobalStateByKey(algodClient, pclib.getAppId('pricecaster'), ownerAddr, 'coreid')
    expect(coreid.toString()).to.equal(testConfig.CORE_CONTRACT_ID)
  })

  // it('Must set stateless logic hash from owner', async function () {
  //   const teal = 'test/temp/vaa-verify.teal'
  //   spawnSync('python', ['teal/wormhole/pyteal/vaa-verify.py', appId, teal])
  //   const program = fs.readFileSync(teal, 'utf8')
  //   compiledVerifyProgram = await pclib.compileProgram(program)
  //   verifyProgramHash = compiledVerifyProgram.hash
  //   console.log('    - Stateless program: ', verifyProgramHash)

  //   const txid = await pclib.setVAAVerifyProgramHash(ownerAddr, verifyProgramHash, signCallback)
  //   await pclib.waitForTransactionResponse(txid)
  //   const vphstate = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vphash')
  //   expect(vphstate).to.equal(verifyProgramHash)

  //   // Feed this account for verification fees.
  //   const parms = await getTxParams()
  //   const tx = makePaymentTxnWithSuggestedParams(ownerAddr, verifyProgramHash, 200000, undefined, undefined, parms)
  //   const signedTx = signCallback(ownerAddr, tx)
  //   await algodClient.sendRawTransaction(signedTx).do()
  //   await pclib.waitForTransactionResponse(tx.txID().toString())
  // })

  // it('Must set authorized appcall id from owner', async function () {
  //   const txid = await pclib.setAuthorizedAppId(ownerAddr, pkAppId, signCallback)
  //   await pclib.waitForTransactionResponse(txid)
  //   const authid = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'authid')
  //   expect(authid).to.equal(pkAppId)
  // })

  // it('Must disallow setting stateless logic hash from non-owner', async function () {
  //   await expect(pclib.setVAAVerifyProgramHash(otherAddr, verifyProgramHash, signCallback)).to.be.rejectedWith(/logic eval error/g)
  // })

  // it('Must reject setting stateless logic hash from group transaction', async function () {
  //   const appArgs = [new Uint8Array(Buffer.from('setvphash')), new Uint8Array(verifyProgramHash)]
  //   const params = await getTxParams()

  //   const gid = pclib.beginTxGroup()
  //   const appTx = algosdk.makeApplicationNoOpTxn(ownerAddr, params, appId, appArgs)
  //   const dummyTx = algosdk.makeApplicationNoOpTxn(ownerAddr, params, appId, appArgs)
  //   pclib.addTxToGroup(gid, appTx)
  //   pclib.addTxToGroup(gid, dummyTx)
  //   await expect(pclib.commitTxGroup(gid, ownerAddr, signCallback)).to.be.rejectedWith(/logic eval error/g)
  // })

  // it('Must reject setting stateless logic hash with invalid address length', async function () {
  //   const appArgs = [new Uint8Array(Buffer.from('setvphash')), new Uint8Array(verifyProgramHash).subarray(0, 10)]
  //   await expect(pclib.callApp(ownerAddr, 'vaaProcessor', appArgs, [], signCallback)).to.be.rejectedWith(/logic eval error/g)
  // })

  // it('Must reject incorrect transaction group size', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const vssize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const badSize = 4 + Math.ceil(gscount / vssize)
  //   await expect(execVerify(badSize, vssize, guardianKeys, pythVaaSignatures, pythVaaBody, gscount)).to.be.rejectedWith('Bad Request')
  // })

  // it('Must reject incorrect argument count for verify call', async function () {
  //   const verifyFunc = function (sender, params, payload, gksubset, totalguardians) {
  //     const appArgs = []
  //     appArgs.push(new Uint8Array(Buffer.from('verify')))
  //     const tx = algosdk.makeApplicationNoOpTxn(sender,
  //       params,
  //       appId,
  //       appArgs, undefined, undefined, undefined,
  //       new Uint8Array(payload))
  //     pclib.groupTx.push(tx)

  //     return tx.txID()
  //   }
  //   pclib.beginTxGroup()
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const vssize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const groupSize = Math.ceil(gscount / vssize)
  //   await expect(execVerify(groupSize, vssize, guardianKeys, pythVaaSignatures, pythVaaBody, gscount, undefined, undefined, verifyFunc)).to.be.rejectedWith('Bad Request')
  // })

  // it('Must reject unknown sender for verify call', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const vssize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const groupSize = Math.ceil(gscount / vssize)
  //   await expect(execVerify(groupSize, vssize, guardianKeys, pythVaaSignatures, pythVaaBody, gscount, undefined, otherAddr)).to.be.rejectedWith('Bad Request')
  // })

  // it('Must reject guardian set count argument not matching global state', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const vssize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const groupSize = Math.ceil(gscount / vssize)
  //   await expect(execVerify(groupSize, vssize, guardianKeys, pythVaaSignatures, pythVaaBody, 2)).to.be.rejectedWith('Bad Request')
  // })

  // it('Must reject guardian key list argument not matching global state', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const vssize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const groupSize = Math.ceil(gscount / vssize)
  //   const gkBad = guardianKeys.slice(0, guardianKeys.length - 3)
  //   await expect(execVerify(groupSize, vssize, gkBad, pythVaaSignatures, pythVaaBody, 2)).to.be.rejectedWith('Bad Request')
  // })
  // it('Must reject non-app call transaction in group', async function () {

  // })
  // it('Must reject app-call with mismatched AppId in group', async function () {

  // })
  // it('Must reject transaction with not verified bit set in group', async function () {

  // })

  // it('Must reject unknown emitter VAA', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const stepSize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const groupSize = Math.ceil(gscount / stepSize)
  //   const numOfAttest = 5
  //   const vaa = createVAA(1, guardianPrivKeys, 1, OTHER_PYTH_EMITTER, numOfAttest)
  //   await expect(buildTransactionGroup(groupSize, stepSize, guardianKeys, gscount, vaa.signatures, vaa.body)).to.be.rejectedWith(/transaction rejected by ApprovalProgram/g)
  // })

  it('Must verify and handle Pyth V2 VAA - all signers present', async function () {
    const gscount = await tools.readAppGlobalStateByKey(algodClient, CORE_CONTRACT_ID, ownerAddr, 'gscount')
    const stepSize = await tools.readAppGlobalStateByKey(algodClient, CORE_CONTRACT_ID, ownerAddr, 'vssize')
    const groupSize = Math.ceil(gscount / stepSize)
    const numOfAttest = 5
    const vaa = createVAA(1, guardianPrivKeys, 1, PYTH_EMITTER, numOfAttest)
    const tx = await buildTransactionGroup2(vaa);//(groupSize, stepSize, guardianKeys, gscount, vaa.signatures, vaa.body)
    //await pclib.waitForConfirmation(tx)
    //await checkAttestations(vaa, numOfAttest)
  })

  // it('Must fail to verify VAA - (shuffle signers)', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const stepSize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const groupSize = Math.ceil(gscount / stepSize)
  //   const vaa = createVAA(1, guardianPrivKeys, 1, PYTH_EMITTER, 5)

  //   let shuffleGuardianPrivKeys = [...guardianPrivKeys]
  //   shuffleGuardianPrivKeys = testLib.shuffle(shuffleGuardianPrivKeys)

  //   await expect(buildTransactionGroup(groupSize, stepSize, shuffleGuardianPrivKeys, gscount, vaa.signatures, vaa.body)).to.be.rejectedWith(/rejected by logic/g)
  // })

  // it('Must verify VAA with signers > 2/3 + 1', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const stepSize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')

  //   // Fixed-point division
  //   // https://github.com/certusone/wormhole/blob/00ddd5f02ba34e6570823b23518af8bbd6d91231/ethereum/contracts/Messages.sol#L30

  //   const quorum = Math.trunc(((gscount * 10 / 3) * 2) / 10 + 1)
  //   const slicedGuardianPrivKeys = guardianPrivKeys.slice(0, quorum + 1)
  //   const vaa = createVAA(0, slicedGuardianPrivKeys,  1, PYTH_EMITTER, 5)
  //   const groupSize = Math.ceil(gscount / stepSize)
  //   const tx = await buildTransactionGroup(groupSize, stepSize, guardianKeys, gscount, vaa.signatures, vaa.body)
  //   await pclib.waitForConfirmation(tx)
  // })

  // it('Must fail to verify VAA with <= 2/3 + 1 signers (no quorum)', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const stepSize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')

  //   // Fixed-point division
  //   // https://github.com/certusone/wormhole/blob/00ddd5f02ba34e6570823b23518af8bbd6d91231/ethereum/contracts/Messages.sol#L30

  //   const quorum = Math.trunc(((gscount * 10 / 3) * 2) / 10 + 1)
  //   const slicedGuardianPrivKeys = guardianPrivKeys.slice(0, quorum)
  //   const vaa = createVAA(0, slicedGuardianPrivKeys, 1, PYTH_EMITTER, 5)
  //   const groupSize = Math.ceil(gscount / stepSize)
  //   await expect(buildTransactionGroup(groupSize, stepSize, guardianKeys, gscount, vaa.signatures, vaa.body)).to.be.rejectedWith(/rejected by logic/g)
  // })
  // // it('Must verify and handle governance VAA', async function () {
  // //   // TBD
  // // })

  // it('Must set new emitter VAA', async function () {
  //   const txid = await pclib.setPythEmitterAddress(ownerAddr, OTHER_PYTH_EMITTER, signCallback)
  //   await pclib.waitForTransactionResponse(txid)
  //   const vphstate = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'emitter', true)
  //   expect(vphstate).to.equal(Buffer.from(OTHER_PYTH_EMITTER.replace(/^0x/g, ''), 'hex').toString('base64'))
  // })

  // it('Must verify and handle Pyth V2 VAA (new emitter)', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const stepSize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const groupSize = Math.ceil(gscount / stepSize)
  //   const numOfAttest = 5
  //   const vaa = createVAA(1, guardianPrivKeys, 1, OTHER_PYTH_EMITTER, numOfAttest)
  //   const tx = await buildTransactionGroup(groupSize, stepSize, guardianKeys, gscount, vaa.signatures, vaa.body)
  //   await pclib.waitForConfirmation(tx)
  //   await checkAttestations(vaa, numOfAttest)
  // })

  // it('Stateless: Must reject transaction with excess fee', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const vssize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const groupSize = Math.ceil(gscount / vssize)
  //   await expect(execVerify(groupSize, vssize, guardianKeys, pythVaaSignatures, pythVaaBody, gscount, 800000)).to.be.rejectedWith('Bad Request')
  // })

  // it('Stateless: Must reject incorrect number of logic program arguments', async function () {

  // })

  // it('Stateless: Must reject transaction with mismatching number of signatures', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const vssize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const groupSize = Math.ceil(gscount / vssize)
  //   const pythVaaSignatures2 = pythVaaSignatures.substr(0, pythVaaSignatures.length - 132 - 1)
  //   await expect(execVerify(groupSize, vssize, guardianKeys, pythVaaSignatures2, pythVaaBody, gscount)).to.be.rejectedWith('Bad Request')
  // })

  // it('Stateless: Must reject transaction with non-zero rekey', async function () {

  // })

  // it('Stateless: Must reject transaction call from bad app-id', async function () {

  // })

  // it('Stateless: Must reject signature verification failure', async function () {
  //   const gscount = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'gscount')
  //   const vssize = await tools.readAppGlobalStateByKey(algodClient, appId, ownerAddr, 'vssize')
  //   const groupSize = Math.ceil(gscount / vssize)
  //   let pythVaaSignatures2 = pythVaaSignatures.substr(0, pythVaaSignatures.length - 132 - 1)
  //   pythVaaSignatures2 += '0d525ac1524ec9d9ee623ef535a867e8f86d9b3f8e4c7b4234dbe7bb40dc8494327af2fa37c3db50064d6114f2e1441c4eee444b83636f11ce1f730f7b38490e2800'
  //   await expect(execVerify(groupSize, vssize, guardianKeys, pythVaaSignatures2, pythVaaBody, gscount)).to.be.rejectedWith('Bad Request')
  // })
})
