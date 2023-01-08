import { parseProductData } from '@pythnetwork/client'
import { Cluster, clusterApiUrl, Connection, PublicKey } from '@solana/web3.js'
const columnify = require('columnify')

/** Mapping from solana clusters to the public key of the pyth program. */
const clusterToPythProgramKey: Record<Cluster, string> = {
  'mainnet-beta': 'FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH',
  devnet: 'gSbePebfvPy7tRqimPoVecS2UsBvYv46ynrzWocc92s',
  testnet: '8tfDNiaEyrV6Q1U4DEXrEigs9DoDtkugzFbybENEbCDz'
}

/** Gets the public key of the Pyth program running on the given cluster. */
export function getPythProgramKeyForCluster (cluster: Cluster): PublicKey {
  if (clusterToPythProgramKey[cluster] !== undefined) {
    return new PublicKey(clusterToPythProgramKey[cluster])
  } else {
    throw new Error(
      `Invalid Solana cluster name: ${cluster}. Valid options are: ${JSON.stringify(
        Object.keys(clusterToPythProgramKey)
      )}`
    )
  }
}

(async () => {
  const SOLANA_CLUSTER_NAME: Cluster = 'devnet'
  const connection = new Connection(clusterApiUrl(SOLANA_CLUSTER_NAME))
  const pythPublicKey = getPythProgramKeyForCluster(SOLANA_CLUSTER_NAME)
  const accounts = await connection.getProgramAccounts(pythPublicKey, 'finalized')

  type PriceEntry = {
    symbol: string,
    priceId: string
  }

  const priceEntryData: PriceEntry[] = []

  for (const acc of accounts) {
    const productData = parseProductData(acc.account.data)
    if (productData.type === 2 && productData.product.symbol) {
      priceEntryData.push({ symbol: productData.product.symbol, priceId: Buffer.from(productData.priceAccountKey.toBytes()).toString('hex')})
    }
  }

  console.log(columnify(priceEntryData.sort( (a, b) => a.symbol > b.symbol ? 1 : -1)))
})()
