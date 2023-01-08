module.exports = {
  pyth: {
    priceService: {
      mainnet: 'https://xc-mainnet.pyth.network',
      testnet: 'https://xc-testnet.pyth.network',
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
    token: '30F57B65916305B7761149D46E0E8D548A9123383E87A28341517F6C39CF20C7',
    api: 'http://51.210.214.25/',
    port: '8002',
    dumpFailedTx: false,
    dumpFailedTxDirectory: './dump'
  },
  apps: {
    pricecasterAppId: 152524708,
    ownerKeyFile: './keys/owner.key'
  },
  debug: {
    skipPublish: false
  },
  storage: {
    db: './db/pricecaster.db'
  },
  network: 'testnet'
}
