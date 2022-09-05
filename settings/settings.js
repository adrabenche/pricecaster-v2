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
  filters: {
    mainnet: [
      {
        chain_id: 1,
        emitter_address: '6bb14509a612f01fbbc4cffeebd4bbfb492a86df717ebe92eb6df432a3f00a25'
      },
      {
        chain_id: 26,
        emitter_address: 'f8cd23c2ab91237730770bbea08d61005cdda0984348f3f6eecb559638c0bba0'
      }
    ],
    testnet: [
      {
        chain_id: 1,
        emitter_address: 'f346195ac02f37d60d4db8ffa6ef74cb1be3550047543a4a9ee9acf4d78697b0'
      },
      {
        chain_id: 26,
        emitter_address: 'a27839d641b07743c0cb5f68c51f8cd31d2c0762bec00dc6fcd25433ef1ab5b6'
      }
    ]
  },
  apps: {
    pricecasterAppId: 107510319,
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
