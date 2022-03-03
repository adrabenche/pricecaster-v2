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
const Config = __importStar(require("@randlabs/js-config-reader"));
const process_1 = require("process");
const WormholeEngine_1 = require("./engine/WormholeEngine");
const Logger = __importStar(require("@randlabs/js-logger"));
const charm = require('charm')();
(async () => {
    charm.pipe(process.stdout);
    charm.reset();
    charm.foreground('cyan').display('bright');
    console.log('Pricecaster Service Backend  -- (c) 2022 Wormhole Project Contributors\n');
    charm.foreground('white');
    let settings;
    try {
        await Config.initialize({ envVar: 'PRICECASTER_SETTINGS' });
        settings = Config.get();
        await Logger.initialize(settings.log);
    }
    catch (e) {
        console.error('Cannot initialize configuration: ' + e.toString());
        (0, process_1.exit)(1);
    }
    const engine = new WormholeEngine_1.WormholeClientEngine(settings);
    await engine.start();
})();
//# sourceMappingURL=main.js.map