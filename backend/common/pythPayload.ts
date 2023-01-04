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

    const pythAttest: PythAttestation = {
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

export function getPriceIdsInVaa (vaaPayload: Buffer): string[] {
  const priceIds: string[] = []
  const numAttest = vaaPayload.readInt16BE(11)
  const sizeAttest = vaaPayload.readInt16BE(13)

  for (let i = 0; i < numAttest; ++i) {
    const attestation = tools.extract3(vaaPayload, 15 + (i * sizeAttest), sizeAttest)
    const priceId = tools.extract3(attestation, 32, 32)
    priceIds.push(priceId.toString('hex'))
  }
  return priceIds
}
