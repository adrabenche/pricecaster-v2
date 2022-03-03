"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Pricekeeper2Publisher = void 0;
const algosdk_1 = __importDefault(require("algosdk"));
const statusCodes_1 = require("../common/statusCodes");
const PricecasterLib = require('../../lib/pricecaster');
const tools = require('../../tools/app-tools');
const { arrayChunks } = require('../../tools/app-tools');
class Pricekeeper2Publisher {
    constructor(vaaProcessorAppId, priceKeeperAppId, vaaProcessorOwner, verifyProgramBinary, verifyProgramHash, signKey, algoClientToken, algoClientServer, algoClientPort, dumpFailedTx = false, dumpFailedTxDirectory = './') {
        this.numOfVerifySteps = 0;
        this.guardianCount = 0;
        this.stepSize = 0;
        this.compiledVerifyProgram = { bytes: new Uint8Array(), hash: '' };
        this.account = signKey;
        this.compiledVerifyProgram.bytes = verifyProgramBinary;
        this.compiledVerifyProgram.hash = verifyProgramHash;
        this.vaaProcessorAppId = vaaProcessorAppId;
        this.vaaProcessorOwner = vaaProcessorOwner;
        this.dumpFailedTx = dumpFailedTx;
        this.dumpFailedTxDirectory = dumpFailedTxDirectory;
        this.algodClient = new algosdk_1.default.Algodv2(algoClientToken, algoClientServer, algoClientPort);
        this.pclib = new PricecasterLib.PricecasterLib(this.algodClient);
        this.pclib.setAppId('vaaProcessor', vaaProcessorAppId);
        this.pclib.setAppId('pricekeeper', priceKeeperAppId);
        this.pclib.enableDumpFailedTx(this.dumpFailedTx);
        this.pclib.setDumpFailedTxDirectory(this.dumpFailedTxDirectory);
    }
    async start() {
    }
    stop() {
    }
    signCallback(sender, tx) {
        const txSigned = tx.signTxn(this.account.sk);
        return txSigned;
    }
    async publish(data) {
        const publishInfo = { status: statusCodes_1.StatusCode.OK };
        const txParams = await this.algodClient.getTransactionParams().do();
        txParams.fee = 1000;
        txParams.flatFee = true;
        this.guardianCount = await tools.readAppGlobalStateByKey(this.algodClient, this.vaaProcessorAppId, this.vaaProcessorOwner, 'gscount');
        this.stepSize = await tools.readAppGlobalStateByKey(this.algodClient, this.vaaProcessorAppId, this.vaaProcessorOwner, 'vssize');
        this.numOfVerifySteps = Math.ceil(this.guardianCount / this.stepSize);
        if (this.guardianCount === 0 || this.stepSize === 0) {
            throw new Error('cannot get guardian count and/or step-size from global state');
        }
        try {
            const guardianKeys = [];
            const buf = Buffer.alloc(8);
            for (let i = 0; i < this.guardianCount; i++) {
                buf.writeBigUInt64BE(BigInt(i++));
                const gk = await tools.readAppGlobalStateByKey(this.algodClient, this.vaaProcessorAppId, this.vaaProcessorOwner, buf.toString());
                guardianKeys.push(Buffer.from(gk, 'base64').toString('hex'));
            }
            if (guardianKeys.length === 0) {
                throw new Error('No guardian keys in global state.');
            }
            const keyChunks = arrayChunks(guardianKeys, this.stepSize);
            const sigChunks = arrayChunks(data.signatures, this.stepSize * 132);
            const gid = this.pclib.beginTxGroup();
            for (let i = 0; i < this.numOfVerifySteps; i++) {
                this.pclib.addVerifyTx(gid, this.compiledVerifyProgram.hash, txParams, data.vaaBody, keyChunks[i], this.guardianCount);
            }
            this.pclib.addPriceStoreTx(gid, this.vaaProcessorOwner, txParams, data.vaaBody.slice(51));
            const txId = await this.pclib.commitVerifyTxGroup(gid, this.compiledVerifyProgram.bytes, data.signatures.length, sigChunks, this.vaaProcessorOwner, this.signCallback.bind(this));
            publishInfo.txid = txId;
            publishInfo.confirmation = algosdk_1.default.waitForConfirmation(this.algodClient, txId, 10);
        }
        catch (e) {
            publishInfo.status = statusCodes_1.StatusCode.ERROR_SUBMIT_MESSAGE;
            if (e.response) {
                publishInfo.reason = e.response.text ? e.response.text : e.toString();
            }
            else {
                publishInfo.reason = e.toString();
            }
            return publishInfo;
        }
        return publishInfo;
    }
}
exports.Pricekeeper2Publisher = Pricekeeper2Publisher;
//# sourceMappingURL=Pricekeeper2Publisher.js.map