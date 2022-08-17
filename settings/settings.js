module.exports = {
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
    dumpFailedTx: true,
    dumpFailedTxDirectory: './dump'
  },
  apps: {
    wormholeCoreAppId: 86525623,
    pricecasterAppId: 105401087,
    asaIdMapperDataNetwork: 'testnet',
    ownerAddress: 'XNP7HMWUZAJTTHNIGENRKUQOGL5FQV3QVDGYUYUCGGNSHN3CQGMQKL3XHM',
    ownerKeyFile: './keys/owner.key'
  },
  pyth: {
    // Devnet
    chainId: 1, emitterAddress: 'f346195ac02f37d60d4db8ffa6ef74cb1be3550047543a4a9ee9acf4d78697b0'
    //
    // Mainnet-beta
    // chainId: 1, emitterAddress: '6bb14509a612f01fbbc4cffeebd4bbfb492a86df717ebe92eb6df432a3f00a25'
    //
  },
  wormhole: {
    spyServiceHost: 'localhost:7073'
  },
  symbols: {
    sourceNetwork: 'devnet'
  },
  debug: {
    skipPublish: false
  }
}
