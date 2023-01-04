module.exports = {
  // Configurations to use:
  //
  // Algoexplorer Betanet endpoint:
  //
  // ALGORAND_NODE_TOKEN: ''
  // ALGORAND_NODE_HOST:  'https://api.betanet.algoexplorer.io',
  // ALGORAND_NODE_PORT: ''
  //
  // Algoexplorer Testnet endpoint:
  //
  // ALGORAND_NODE_TOKEN: ''
  // ALGORAND_NODE_HOST:  'https://api.testnet.algoexplorer.io'
  // ALGORAND_NODE_PORT: ''
  //
  // Sandbox:
  //
  ALGORAND_NODE_TOKEN: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  ALGORAND_NODE_HOST: 'http://localhost',
  ALGORAND_NODE_PORT: '4001',
  //
  // Funding source for accounts. This must be used with Tilt dev accounts.
  //
  SOURCE_ACCOUNT: 'DEV7AREMQSPWWDDFFJ3A5OIMMDCZN4YT5U2MQBN76Y4J5ERQQ3MWPIHUYA',
  SOURCE_MNEMO: 'provide warfare better filter glory civil help jacket alpha penalty van fiber code upgrade web more curve sauce merit bike satoshi blame orphan absorb modify',
  //
  // Owner account. Tilt-account.
  //
  OWNER_MNEMO: 'album neglect very nasty input trick annual arctic spray task candy unfold letter drill glove sword flock omit dial rather session mesh slow abandon slab',
  //
  // Set to true to dump failed TX
  //
  DUMP_FAILED_TX: false,
  //
  // Python binary
  //
  PYTHON_BIN: 'python3.10',
  //
  //
  PYTEALSOURCE: 'teal/pyteal/pricecaster-v2.py'
}
