module.exports = {
  pyth: {
    priceService: {
      mainnet: 'https://xc-mainnet.pyth.network',
      testnet: 'https://xc-testnet.pyth.network',
      pollIntervalMs: 1000,
      requestBlockSize: 32
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
  txMonitor: {
    updateIntervalMs: 1000,
    confirmationThreshold: 1
  },
  priceIds: {
    mainnet: [
    ],
    testnet: [
      '0x08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318', // ALGO/USD
      '0xca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6', // ETH/USD
      '0x41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722', // USDC/USD
      '0xd7566a3ba7f7286ed54f4ae7e983f4420ae0b1e0f3892e11f9c4ab107bbad7b9', // AVAX/USD
      '0xd2c2c1f2bba8e0964f9589e060c2ee97f5e19057267ac3284caef3bd50bd2cb5', // MATIC/USD
      '0xecf553770d9b10965f8fb64771e93f5690a182edc32be4a3236e0caaa6e0581a' // BNB/USD
    ]
  },
  apps: {
    pricecasterAppId: 123328237,
    ownerKeyFile: './keys/owner.key'
  },
  wormhole: {
    spyServiceHost: 'localhost:7073'
  },
  debug: {
    skipPublish: false
  },
  network: 'testnet'
}
