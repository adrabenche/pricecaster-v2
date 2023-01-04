/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */
/**
 * Pricecaster Service.
 *
 * Fetcher backend component.
 *
 * Copyright 2022 Randlabs Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export type PriceId = string

export type DataReadyCallback = (vaaList: Buffer[]) => Promise<void>

export type VAA = {
  version: number,
  guardian_set_index: number,
  signatures: [],
  timestamp: number,
  nonce: number,
  emitter_chain: number,
  emitter_address: [],
  sequence: number,
  consistency_level: number,
  payload: Buffer
}
export type PythAttestation = {
  productId: Buffer,
  priceId: Buffer,
  price: BigInt,
  conf: BigInt,
  expo: number,
  ema_price: BigInt,
  ema_conf: BigInt,
  status: number,
  num_publishers: number,
  max_num_publishers: number,
  attestation_time: BigInt,
  publish_time: BigInt,
  prev_publish_time: BigInt,
  prev_price: BigInt,
  prev_conf: BigInt
}
export type PythData = {
  vaa: Buffer,
  payload: Buffer,
  attestations: PythAttestation[]
}
