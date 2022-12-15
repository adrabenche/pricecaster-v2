/**
 * Pricecaster Service.
 *
 * VAA Cache Implementation
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

import { PriceId } from '../common/basetypes'
import { IVaaCache } from './IVaaCache'

export class VaaCache implements IVaaCache {
  private vaaMap: Map<PriceId, Uint8Array>

  constructor () {
    this.vaaMap = new Map<PriceId, Uint8Array>()
  }

  store (vaa: Uint8Array, priceid: PriceId): void {
    this.vaaMap.set(priceid, vaa)
  }

  fetch (priceid: PriceId): Uint8Array {
    const vaa = this.vaaMap.get(priceid)
    if (!vaa) {
      throw new Error('There is no Vaa cached for such PriceId')
    }
    return vaa
  }
}
