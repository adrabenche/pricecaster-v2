module.exports = {
  pollInterval: 4,
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
    // token: '',
    // api: 'https://api.testnet.algoexplorer.io',
    // port: '',
    dumpFailedTx: true,
    dumpFailedTxDirectory: './dump'
  },
  apps: {
    wormholeCoreAppId: 1054,
    priceKeeperV2AppId: 728,
    vaaVerifyProgramHash: '5PKAA6VERF6XZQAOJVKST262JKLKIYP3EGFO54ZD7YPUV7TRQOZ2BN6SPA',
    asaIdMapperAppId: 729,
    vaaVerifyProgramBinFile: 'bin/vaa-verify.bin',
    asaIdMapperDataNetwork: 'testnet',
    ownerAddress: 'XNP7HMWUZAJTTHNIGENRKUQOGL5FQV3QVDGYUYUCGGNSHN3CQGMQKL3XHM',
    ownerKeyFile: './keys/owner.key'
  },
  pyth: {
    // Devnet
    //
    // chainId: 1,emitterAddress: 'f346195ac02f37d60d4db8ffa6ef74cb1be3550047543a4a9ee9acf4d78697b0'
    //
    // Mainnet-beta
    //
    chainId: 1,
    emitterAddress: 'ec7372995d5cc8732397fb0ad35c0121e0eaa90d26f828a534cab54391b3a4f5'
  },
  wormhole: {
    spyServiceHost: 'natasha.randlabs.io:7074'
  },
  symbols: {
    sourceNetwork: 'mainnet-beta'
  },
  debug: {
    skipPublish: true
  }
}
