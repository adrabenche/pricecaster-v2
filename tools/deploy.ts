/**
 *
 * Pricecaster V2 Deployment Tool.
 *
 * Copyright 2022 Wormhole Project Contributors
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
 *
 */

/* eslint-disable linebreak-style */
import algosdk from 'algosdk'
import PricecasterLib, { MAPPER_CI, PRICECASTER_CI } from '../lib/pricecaster'
const { exit } = require('process')
const readline = require('readline')
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})
const spawnSync = require('child_process').spawnSync
const fs = require('fs')
const config = require('./deploy.config')

function ask (questionText: string) {
  return new Promise((resolve) => {
    rl.question(questionText, (input: unknown) => resolve(input))
  })
}

let globalMnemo = ''

function signCallback (sender: string, tx: algosdk.Transaction) {
  return tx.signTxn(algosdk.mnemonicToSecretKey(globalMnemo).sk)
}

async function startOp (algodClient: algosdk.Algodv2, fromAddress: string, coreId: string) {
  const pclib = new PricecasterLib(algodClient, fromAddress)

  let out = spawnSync('python', [config.sources.pricecaster_pyteal])
  console.log(out.output.toString())

  console.log('Creating Pricekeeper V2...')
  let txId = await pclib.createPricecasterApp(fromAddress, parseInt(coreId), signCallback)
  console.log('txId: ' + txId)
  let txResponse = await pclib.waitForTransactionResponse(txId)
  const pkAppId = pclib.appIdFromCreateAppResponse(txResponse)
  console.log('Deployment App Id: %d', pkAppId)
  pclib.setAppId(PRICECASTER_CI, pkAppId)

  out = spawnSync('python', [config.sources.mapper_pyteal])
  console.log(out.output.toString())

  console.log('Creating ASA ID Mapper...')
  txId = await pclib.createMapperApp(fromAddress, signCallback)
  console.log('txId: ' + txId)
  txResponse = await pclib.waitForTransactionResponse(txId)
  const mapperAppId = pclib.appIdFromCreateAppResponse(txResponse)
  console.log('Deployment App Id: %d', mapperAppId)
  pclib.setAppId(MAPPER_CI, mapperAppId)

  console.log('Compiling verify VAA stateless code...')
  out = spawnSync('python', [config.sources.vaa_verify_pyteal])
  console.log(out.output.toString())

  spawnSync('python', [config.sources.vaa_verify_pyteal])
  const program = fs.readFileSync('vaa_verify.teal', 'utf8')
  const compiledVerifyProgram = await pclib.compileProgram(program)
  console.log('Stateless program address: ', compiledVerifyProgram.hash)

  const dt = Date.now().toString()
  const resultsFileName = 'DEPLOY-' + dt
  const binaryFileName = 'VAA-VERIFY-' + dt + '.BIN'

  console.log(`Writing deployment results file ${resultsFileName}...`)
  fs.writeFileSync(resultsFileName, `wormholeCoreAppId: ${coreId}\npriceKeeperV2AppId: ${pkAppId}\nvaaVerifyProgramHash: '${compiledVerifyProgram.hash}'\nasaIdMapperAppId: ${mapperAppId}`)

  console.log(`Writing stateless code binary file ${binaryFileName}...`)
  fs.writeFileSync(binaryFileName, compiledVerifyProgram.bytes)
}

(async () => {
  console.log('\nPricecaster v2 Apps Deployment Tool')
  console.log('Copyright 2022 Wormhole Project Contributors\n')

  if (process.argv.length !== 6) {
    console.log('Usage: deploy <coreid> <from> <network> <keyfile>\n')
    console.log('where:\n')
    console.log('coreid                 The application id of the Wormhole core contract')
    console.log('from                   Deployer account')
    console.log('network                Testnet, betanet, mainnet or dev (look in deploy.config.ts)')
    console.log('keyfile                Secret file containing signing key mnemonic')
    exit(0)
  }

  const coreId = process.argv[2]
  const fromAddress: string = process.argv[3]
  const network: string = process.argv[4]
  const keyfile: string = process.argv[5]

  const netconfig = config.networks[network]
  if (config === undefined) {
    console.log('Unsupported network: ' + network)
    exit(1)
  }

  if (!algosdk.isValidAddress(fromAddress)) {
    console.error('Invalid deployer address: ' + fromAddress)
    exit(1)
  }

  const algodClient = new algosdk.Algodv2(netconfig.token, netconfig.api, netconfig.port)

  console.log('Parameters for deployment: ')
  console.log('From: ' + fromAddress)
  console.log('Network: ' + network)
  const answer = await ask('\nEnter YES to confirm parameters, anything else to abort. ')
  if (answer !== 'YES') {
    console.warn('Aborted by user.')
    exit(1)
  }

  try {
    globalMnemo = fs.readFileSync(keyfile).toString()
    await startOp(algodClient, fromAddress, coreId)
  } catch (e: any) {
    console.error('(!) Deployment Failed: ' + e.toString())
  }
  console.log('Bye.')
  exit(0)
})()
