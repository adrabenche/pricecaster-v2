"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WormholeClientEngine = void 0;
const statusCodes_1 = require("../common/statusCodes");
const WormholePythPriceFetcher_1 = require("../fetcher/WormholePythPriceFetcher");
const Pricekeeper2Publisher_1 = require("../publisher/Pricekeeper2Publisher");
const Logger = __importStar(require("@randlabs/js-logger"));
const sleep_1 = require("../common/sleep");
const SymbolInfo_1 = require("./SymbolInfo");
const fs = require('fs');
const algosdk = require('algosdk');
async function workerRoutine(fetcher, publisher) {
    const data = fetcher.queryData();
    if (data === undefined) {
        return { status: statusCodes_1.StatusCode.NO_TICKER };
    }
    const pub = await publisher.publish(data);
    return { status: pub.status, reason: pub.reason, data, pub };
}
class WormholeClientEngine {
    constructor(settings) {
        this.settings = settings;
        this.shouldQuit = false;
    }
    async start() {
        process.on('SIGINT', () => {
            console.log('Received SIGINT');
            Logger.finalize();
            this.shouldQuit = true;
        });
        let mnemo, verifyProgramBinary;
        try {
            mnemo = fs.readFileSync(this.settings.apps.ownerKeyFile);
            verifyProgramBinary = Uint8Array.from(fs.readFileSync(this.settings.apps.vaaVerifyProgramBinFile));
        }
        catch (e) {
            throw new Error('❌ Cannot read account and/or verify program source: ' + e);
        }
        const publisher = new Pricekeeper2Publisher_1.Pricekeeper2Publisher(this.settings.apps.vaaProcessorAppId, this.settings.apps.priceKeeperV2AppId, this.settings.apps.ownerAddress, verifyProgramBinary, this.settings.apps.vaaVerifyProgramHash, algosdk.mnemonicToSecretKey(mnemo.toString()), this.settings.algo.token, this.settings.algo.api, this.settings.algo.port, this.settings.algo.dumpFailedTx, this.settings.algo.dumpFailedTxDirectory);
        Logger.info(`Gathering prices from Pyth network ${this.settings.symbols.sourceNetwork}...`);
        const symbolInfo = new SymbolInfo_1.PythSymbolInfo(this.settings.symbols.sourceNetwork);
        await symbolInfo.load();
        Logger.info(`Loaded ${symbolInfo.getSymbolCount()} product(s)`);
        const fetcher = new WormholePythPriceFetcher_1.WormholePythPriceFetcher(this.settings.wormhole.spyServiceHost, this.settings.pyth.chainId, this.settings.pyth.emitterAddress, symbolInfo);
        Logger.info('Waiting for fetcher to boot...');
        await fetcher.start();
        Logger.info('Waiting for publisher to boot...');
        await publisher.start();
        Logger.info(`Starting worker routine, interval ${this.settings.pollInterval}s`);
        setInterval(this.callWorkerRoutine, this.settings.pollInterval * 1000, fetcher, publisher);
        while (!this.shouldQuit) {
            await (0, sleep_1.sleep)(1000);
        }
    }
    async callWorkerRoutine(fetcher, publisher) {
        const wrs = await workerRoutine(fetcher, publisher);
        switch (wrs.status) {
            case statusCodes_1.StatusCode.OK: {
                Logger.info(`    TxID ${wrs.pub?.txid}`);
                const pendingInfo = await wrs.pub?.confirmation;
                if (pendingInfo['pool-error'] === '') {
                    if (pendingInfo['confirmed-round']) {
                        Logger.info(` ✔ Confirmed at round ${pendingInfo['confirmed-round']}`);
                    }
                    else {
                        Logger.info('⚠ No confirmation information');
                    }
                }
                else {
                    Logger.error(`❌ Rejected: ${pendingInfo['pool-error']}`);
                }
                if (wrs.data?.attestations === undefined) {
                    Logger.warn(`No attestation data available. Txid= ${wrs.pub?.txid}`);
                }
                else {
                    for (let i = 0; i < wrs.data.attestations.length; ++i) {
                        const att = wrs.data.attestations[i];
                        Logger.info(`     ${att.symbol}     ${att.price} ± ${att.confidence} exp: ${att.exponent} twap:${att.twap}`);
                    }
                }
                break;
            }
            case statusCodes_1.StatusCode.NO_TICKER:
                break;
            default:
                Logger.error('❌ ' + wrs.reason);
        }
    }
}
exports.WormholeClientEngine = WormholeClientEngine;
//# sourceMappingURL=WormholeEngine.js.map