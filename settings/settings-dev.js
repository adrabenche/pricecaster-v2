module.exports = {
  prom: {
    port: 4885
  },
  rest: {
    port: 4884
  },
  pyth: {
    priceService: {
      mainnet: 'https://xc-mainnet.pyth.network',
      testnet: 'https://xc-testnet.pyth.network',
      devnet: 'https://xc-testnet.pyth.network',
      pollIntervalMs: 1000,
      requestBlockSize: 10
    }
  },
  log: {
    appName: 'pricecaster-v2',
    disableConsoleLog: false,
    fileLog: {
      dir: './log',
      daysTokeep: 7
    },
    // sysLog: {
    //   host: '127.0.0.1',
    //   port: 514,
    //   transport: 'udp',
    //   protocol: 'bsd',
    //   sendInfoNotifications: false
    // },
    debugLevel: 1
  },
  algo: {
    token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    api: 'http://localhost',
    port: '4001',
    dumpFailedTx: false,
    dumpFailedTxDirectory: './dump',
    getNetworkTxParamsCycleInterval: 10,
  },
  apps: {
    pricecasterAppId: 71,
    ownerKeyFile: './dev.key'
  },
  debug: {
    skipPublish: false
  },
  storage: {
    db: './db/pricecaster.db'
  },
  network: 'devnet'
}
