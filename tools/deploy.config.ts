module.exports = {
  sources: {
    portal_core_pyteal: '',
    vaa_verify_pyteal: 'wormhole/algorand/vaa_verify.py',
    pricecaster_pyteal: 'teal/pyteal/pricecaster-v2.py',
    mapper_pyteal: 'teal/pyteal/mapper.py'
  },
  networks: {
    testnet: {
      token: '',
      api: 'https://node.testnet.algoexplorerapi.io',
      port: ''
    },
    mainnet: {
      token: '',
      api: 'https://api.algoexplorer.io',
      port: ''
    },
    betanet: {
      token: '',
      api: 'https://api.betanet.algoexplorer.io',
      port: ''
    },
    dev: {
      token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      api: 'http://localhost',
      port: '4001'
    }
  }
}
