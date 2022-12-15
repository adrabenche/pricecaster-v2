import { PythAttestation } from './basetypes'
import tools from '../../tools/app-tools'

/*
* Get attestations from payload
*/
export function getAttestations (numAttest: number, payload: Buffer, sizeAttest: number): PythAttestation[] {
  const attestations: PythAttestation[] = []
  for (let i = 0; i < numAttest; ++i) {
    const attestation = tools.extract3(payload, 15 + (i * sizeAttest), sizeAttest)
    // console.log(i, attestation.toString('hex'))
    const productId = tools.extract3(attestation, 0, 32)
    const priceId = tools.extract3(attestation, 32, 32)

    /// / console.log(base58.encode(productId))
    /// / console.log(base58.encode(priceId))
    // let asaId
    // if (symbol) {
    // asaId = this.mapper.lookupAsa(symbol)
    // } else {
    // Logger.warn(`No symbol found for productId: ${productId} priceId: ${priceId}`)
    // }

    const pythAttest: PythAttestation = {
      asaId: 0,
      symbol: '',
      productId,
      priceId,
      price: attestation.readBigUInt64BE(64),
      conf: attestation.readBigUInt64BE(72),
      expo: attestation.readInt32BE(80),
      ema_price: attestation.readBigUInt64BE(84),
      ema_conf: attestation.readBigUInt64BE(92),
      status: attestation.readUInt8(100),
      num_publishers: attestation.readUInt32BE(101),
      max_num_publishers: attestation.readUInt32BE(105),
      attestation_time: attestation.readBigUInt64BE(109),
      publish_time: attestation.readBigUInt64BE(117),
      prev_publish_time: attestation.readBigUInt64BE(125),
      prev_price: attestation.readBigUInt64BE(133),
      prev_conf: attestation.readBigUInt64BE(141)
    }

    attestations.push(pythAttest)
  }
  return attestations
}
