/**
 *
 * Pricecaster Service Utility Library.
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
 *
 */

import algosdk from 'algosdk'
// eslint-disable-next-line camelcase
import tools from '../tools/app-tools'
const fs = require('fs')

type ContractInfo = {
  schema: {
    globalInts: number,
    globalBytes: number,
    localInts: number,
    localBytes: number
  },
  approvalProgramFile: string,
  clearStateProgramFile: string,
  compiledApproval: {
    bytes: Uint8Array,
    hash: string
  },
  compiledClearState: {
    bytes: Uint8Array,
    hash: string
  },
  appId: number
}

// Pricecaster Contract Info
export const PRICECASTER_CI: ContractInfo = {
  schema: {
    globalInts: 1,
    globalBytes: 63,
    localInts: 0,
    localBytes: 0
  },
  approvalProgramFile: 'teal/build/pricecaster-v2-approval.teal',
  clearStateProgramFile: 'teal/build/pricecaster-v2-clear.teal',
  compiledApproval: {
    bytes: new Uint8Array(),
    hash: ''
  },
  compiledClearState: {
    bytes: new Uint8Array(),
    hash: ''
  },
  appId: 0
}

// Mapper Contract Info
export const MAPPER_CI: ContractInfo = {
  schema: {
    globalInts: 1,
    globalBytes: 63,
    localInts: 0,
    localBytes: 0
  },
  approvalProgramFile: 'teal/build/mapper-approval.teal',
  clearStateProgramFile: 'teal/build/mapper-clear.teal',
  compiledApproval: {
    bytes: new Uint8Array(),
    hash: ''
  },
  compiledClearState: {
    bytes: new Uint8Array(),
    hash: ''
  },
  appId: 0
}

// --------------------------------------------------------------------------------------
type SignCallback = (arg0: string, arg1: algosdk.Transaction) => any

export default class PricecasterLib {
  private algodClient: algosdk.Algodv2
  private ownerAddr: string
  private minFee: number
  private dumpFailedTx: boolean
  private dumpFailedTxDirectory: string

  constructor (algodClient: algosdk.Algodv2, ownerAddr: string) {
    this.algodClient = algodClient
    this.ownerAddr = ownerAddr
    this.minFee = 1000
    this.dumpFailedTx = false
    this.dumpFailedTxDirectory = './'
  }

  /** Set the file dumping feature on failed group transactions
     * @param {boolean} f Set to true to enable function, false to disable.
     */
  enableDumpFailedTx (f: boolean) {
    this.dumpFailedTx = f
  }

  /** Set the file dumping feature output directory
     * @param {string} dir The output directory.
     */
  setDumpFailedTxDirectory (dir: string) {
    this.dumpFailedTxDirectory = dir
  }

  /** Sets a contract approval program filename
     * @param {string} contract The contract info to set
     * @param {string} filename New file name to use.
     */
  setApprovalProgramFile (pcci: ContractInfo, filename: string) {
    pcci.approvalProgramFile = filename
  }

  /** Sets a contract clear state program filename
     * @param {string} contract The contract info to set
     * @param {string} filename New file name to use.
     */
  setClearStateProgramFile (pcci: ContractInfo, filename: string) {
    pcci.clearStateProgramFile = filename
  }

  /** Sets approval program bytes and hash
    * @param {string} contract The contract info to set
    * @param {*}      bytes Compiled program bytes
    * @param {string} hash  Compiled program hash
    */
  setCompiledApprovalProgram (pcci: ContractInfo, bytes: Uint8Array, hash: string) {
    pcci.compiledApproval.bytes = bytes
    pcci.compiledApproval.hash = hash
  }

  /** Sets compiled clear state contract bytes and hash
    * @param {string} contract The contract info to set
    * @param {*}      bytes Compiled program bytes
    * @param {string} hash  Compiled program hash
    */
  setCompiledClearStateProgram (pcci: ContractInfo, bytes: Uint8Array, hash: string) {
    pcci.compiledClearState.bytes = bytes
    pcci.compiledClearState.hash = hash
  }

  /**
     * Set Application Id for a contract.
     * @param {number} applicationId application id
     * @returns {void}
     */
  setAppId (pcci: ContractInfo, applicationId: number) {
    pcci.appId = applicationId
  }

  /**
     * Get the Application id for a specific contract
     * @returns The requested application Id
     */
  getAppId (pcci: ContractInfo) {
    return pcci.appId
  }

  /**
     * Get minimum fee to pay for transactions.
     * @return {Number} minimum transaction fee
     */
  minTransactionFee (): number {
    return this.minFee
  }

  /**
     * Internal function.
     * Read application local state related to the account.
     * @param  {String} accountAddr account to retrieve local state
     * @return {Array} an array containing all the {key: value} pairs of the local state
     */
  async readLocalState (accountAddr: string, pcci: ContractInfo): Promise<any> {
    return tools.readAppLocalState(this.algodClient, pcci.appId, accountAddr)
  }

  /**
     * Internal function.
     * Read application global state.
     * @return {Array} an array containing all the {key: value} pairs of the global state
     * @returns {void}
     */
  async readGlobalState (pcci: ContractInfo): Promise<any> {
    return tools.readAppGlobalState(this.algodClient, pcci.appId, this.ownerAddr)
  }

  /**
     * Print local state of accountAddr on stdout.
     * @param  {String} accountAddr account to retrieve local state
     * @returns {void}
     */
  async printLocalState (accountAddr: string, pcci: ContractInfo): Promise<void> {
    await tools.printAppLocalState(this.algodClient, pcci.appId, accountAddr)
  }

  /**
     * Print application global state on stdout.
     * @returns {void}
     */
  async printGlobalState (pcci: ContractInfo): Promise<void> {
    await tools.printAppGlobalState(this.algodClient, pcci.appId, this.ownerAddr)
  }

  /**
     * Internal function.
     * Read application local state variable related to accountAddr.
     * @param  {String} accountAddr account to retrieve local state
     * @param  {String} key variable key to get the value associated
     * @return {String/Number} it returns the value associated to the key that could be an address, a number or a
     * base64 string containing a ByteArray
     */
  async readLocalStateByKey (accountAddr: string, key: string, pcci: ContractInfo): Promise<any> {
    return tools.readAppLocalStateByKey(this.algodClient, pcci.appId, accountAddr, key)
  }

  /**
     * Internal function.
     * Read application global state variable.
     * @param  {String} key variable key to get the value associated
     * @return {String/Number} it returns the value associated to the key that could be an address,
     * a number or a base64 string containing a ByteArray
     */
  async readGlobalStateByKey (key: string, pcci: ContractInfo): Promise<any> {
    return tools.readAppGlobalStateByKey(this.algodClient, pcci.appId, this.ownerAddr, key)
  }

  /**
     * Compile program that programFilename contains.
     * @param {String} programBytes Array of program bytes
     * @return {String} base64 string containing the compiled program
     */
  async compileProgram (programBytes: Uint8Array): Promise<{ bytes: Uint8Array; hash: any }> {
    const compileResponse = await this.algodClient.compile(programBytes).do()
    const compiledBytes = new Uint8Array(Buffer.from(compileResponse.result, 'base64'))
    return { bytes: compiledBytes, hash: compileResponse.hash }
  }

  /**
     * Compile clear state program.
     */
  async compileClearProgram (pcci: ContractInfo) {
    const program = fs.readFileSync(pcci.clearStateProgramFile, 'utf8')
    pcci.compiledClearState = await this.compileProgram(program)
  }

  /**
     * Compile approval program.
     */
  async compileApprovalProgram (pcci: ContractInfo, tmplReplace: [string, string][] = []) {
    let program = fs.readFileSync(pcci.approvalProgramFile, 'utf8')
    tmplReplace.forEach((repl) => {
      const regex = new RegExp(`${repl[0]}`, 'g')
      program = program.replace(regex, repl[1])
    })
    pcci.compiledApproval = await this.compileProgram(program)
  }

  /**
     * Helper function to retrieve the application id from a createApp transaction response.
     * @param  {Object} txResponse object containig the transactionResponse of the createApp call
     * @return {Number} application id of the created application
     */
  appIdFromCreateAppResponse (txResponse: any): any {
    return txResponse['application-index']
  }

  /**
     * Create an application based on the default approval and clearState programs or based on the specified files.
     * @param  {String} sender account used to sign the createApp transaction
     * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
     * @param  {Tuple[]} tmplReplace Array of tuples specifying template replacements in output TEAL.
     * @return {String} transaction id of the created application
     */
  async createApp (sender: string,
    pcci: ContractInfo,
    appArgs: Uint8Array[],
    signCallback: SignCallback,
    tmplReplace: [string, string][] = [],
    skipCompile?: any): Promise<string> {
    const onComplete = algosdk.OnApplicationComplete.NoOpOC

    // get node suggested parameters
    const params = await this.algodClient.getTransactionParams().do()
    params.fee = this.minFee
    params.flatFee = true

    if (!skipCompile) {
      await this.compileApprovalProgram(pcci, tmplReplace)
      await this.compileClearProgram(pcci)
    }

    // create unsigned transaction
    const txApp = algosdk.makeApplicationCreateTxn(
      sender, params, onComplete,
      pcci.compiledApproval.bytes,
      pcci.compiledClearState.bytes,
      pcci.schema.localInts,
      pcci.schema.localBytes,
      pcci.schema.globalInts,
      pcci.schema.globalBytes, appArgs
    )
    const txId = txApp.txID().toString()

    // Sign the transaction
    const txAppSigned = signCallback(sender, txApp)

    // Submit the transaction
    await this.algodClient.sendRawTransaction(txAppSigned).do()
    return txId
  }

  /**
       * Create the Pricekeeper application based on the default approval and clearState programs or based on the specified files.
       * @param  {String} sender account used to sign the createApp transaction
       * @param  {String} wormholeCoreAppId The application id of the Wormhole Core program associated.
       * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
       * @return {String} transaction id of the created application
       */
  async createPricecasterApp (sender: string, wormholeCore: number, testMode: boolean, signCallback: SignCallback): Promise<any> {
    return this.createApp(sender, PRICECASTER_CI, [algosdk.encodeUint64(wormholeCore)], signCallback, [['TMPL_I_TESTING', testMode ? '1' : '0']])
  }

  /**
       * Create the Mapper application based on the default approval and clearState programs or based on the specified files.
       * @param  {String} sender account used to sign the createApp transaction
       * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
       * @return {String} transaction id of the created application
       */
  async createMapperApp (sender: string, signCallback: SignCallback): Promise<any> {
    return this.createApp(sender, MAPPER_CI, [], signCallback)
  }

  /**
     * Internal function.
     * Call application specifying args and accounts.
     * @param  {String} sender caller address
     * @param  {Array} appArgs array of arguments to pass to application call
     * @param  {Array} appAccounts array of accounts to pass to application call
     * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
     * @return {String} transaction id of the transaction
     */
  async callApp (sender: string,
    pcci: ContractInfo,
    appArgs: Uint8Array[],
    appAccounts: string[],
    signCallback: SignCallback): Promise<any> {
    // get node suggested parameters
    const params = await this.algodClient.getTransactionParams().do()

    params.fee = this.minFee
    params.flatFee = true

    // create unsigned transaction
    const txApp = algosdk.makeApplicationNoOpTxn(sender, params, pcci.appId, appArgs, appAccounts.length === 0 ? undefined : appAccounts)
    const txId = txApp.txID().toString()

    // Sign the transaction
    const txAppSigned = signCallback(sender, txApp)

    // Submit the transaction
    await this.algodClient.sendRawTransaction(txAppSigned).do()

    return txId
  }

  /**
     * ClearState sender. Remove all the sender associated local data.
     * @param  {String} sender account to ClearState
     * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
     * @return {[String]} transaction id of one of the transactions of the group
     */
  async clearApp (sender: string, signCallback: SignCallback, pcci: ContractInfo): Promise<string> {
    // get node suggested parameters
    const params = await this.algodClient.getTransactionParams().do()

    params.fee = this.minFee
    params.flatFee = true

    const appId = pcci.appId

    // create unsigned transaction
    const txApp = algosdk.makeApplicationClearStateTxn(sender, params, appId)
    const txId = txApp.txID().toString()

    // Sign the transaction
    const txAppSigned = signCallback(sender, txApp)

    // Submit the transaction
    await this.algodClient.sendRawTransaction(txAppSigned).do()

    return txId
  }

  /**
      * Permanent delete the application.
      * @param  {String} sender owner account
      * @param  {Function} signCallback callback with prototype signCallback(sender, tx) used to sign transactions
      * @param  {Function} applicationId use this application id instead of the one set
      * @return {String}      transaction id of one of the transactions of the group
      */
  async deleteApp (sender: string, signCallback: SignCallback, pcci: ContractInfo): Promise<any> {
    // get node suggested parameters
    const params = await this.algodClient.getTransactionParams().do()

    params.fee = this.minFee
    params.flatFee = true

    // create unsigned transaction
    const txApp = algosdk.makeApplicationDeleteTxn(sender, params, pcci.appId)
    const txId = txApp.txID().toString()

    // Sign the transaction
    const txAppSigned = signCallback(sender, txApp)

    // Submit the transaction
    await this.algodClient.sendRawTransaction(txAppSigned).do()

    return txId
  }

  /**
     * Helper function to wait until transaction txId is included in a block/round.
     * @param  {String} txId transaction id to wait for
     * @return {VOID} VOID
     */
  async waitForConfirmation (txId: string): Promise<any> {
    const status = (await this.algodClient.status().do())
    let lastRound = status['last-round']
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const pendingInfo = await this.algodClient.pendingTransactionInformation(txId).do()
      if (pendingInfo['confirmed-round'] !== null && pendingInfo['confirmed-round'] > 0) {
        // Got the completed Transaction

        return pendingInfo['confirmed-round']
      }
      lastRound += 1
      await this.algodClient.statusAfterBlock(lastRound).do()
    }
  }

  /**
     * Helper function to wait until transaction txId is included in a block/round
     * and returns the transaction response associated to the transaction.
     * @param  {String} txId transaction id to get transaction response
     * @return {Object}      returns an object containing response information
     */
  async waitForTransactionResponse (txId: string): Promise<any> {
    // Wait for confirmation
    await this.waitForConfirmation(txId)

    // display results
    return this.algodClient.pendingTransactionInformation(txId).do()
  }

  /**
   * Pricecaster.-V2: Generate store price transaction.
   * @param {*} sender The sender account (typically the VAA verification stateless program)
   * @param {*} assetId The ASA ID that corresponds to this value, or 0 if it's ALGO/USD
   * @param {*} payload The VAA payload
   */
  async makePriceStoreTx (sender: string, assetIds: Uint8Array, payload: Buffer): Promise<algosdk.Transaction> {
    if (this.dumpFailedTx) {
      console.warn(`Dump failed to ${this.dumpFailedTxDirectory} unimplemented`)
    }
    const appArgs = []
    const params = await this.algodClient.getTransactionParams().do()
    params.fee = this.minFee
    params.flatFee = true

    appArgs.push(new Uint8Array(Buffer.from('store')), assetIds, new Uint8Array(payload))

    const tx = algosdk.makeApplicationNoOpTxn(sender,
      params,
      PRICECASTER_CI.appId,
      appArgs)

    return tx
  }
}
