/**
 * Pricecaster Service.
 *
 * Sample slot configuration for bootstrapping.
 *
 * Copyright 2022, 23 Randlabs Inc.
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

import { SlotInfo } from '../backend/common/basetypes'
export type BootstrapSlotLayout = {
  mainnet: SlotInfo[],
  testnet: SlotInfo[],
  devnet: SlotInfo[]
}
const slotLayoutTestnet: SlotInfo[] = [
  {
    priceId: '08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318', // ALGO/USD
    asaId: 0
  },
  {
    priceId: 'ca80ba6dc32e08d06f1aa886011eed1d77c77be9eb761cc10d72b7d0a2fd57a6', // ETH/USD
    asaId: 122146368
  },
  {
    priceId: '41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722', // USDC/USD
    asaId: 113638050
  },
  {
    priceId: 'd7566a3ba7f7286ed54f4ae7e983f4420ae0b1e0f3892e11f9c4ab107bbad7b9', // AVAX/USD
    asaId: 105300796
  },
  {
    priceId: 'd2c2c1f2bba8e0964f9589e060c2ee97f5e19057267ac3284caef3bd50bd2cb5', // MATIC/USD
    asaId: 52771911
  },
  {
    priceId: 'ecf553770d9b10965f8fb64771e93f5690a182edc32be4a3236e0caaa6e0581a', // BNB/USD,
    asaId: 100702091
  }
]

const slotLayoutDevnet: SlotInfo[] = [
  {
    priceId: '08f781a893bc9340140c5f89c8a96f438bcfae4d1474cc0f688e3a52892c7318', // ALGO/USD
    asaId: 0
  }
]

export const bootstrapSlotLayoutInfo: BootstrapSlotLayout = {
  mainnet: [],
  testnet: slotLayoutTestnet,
  devnet: slotLayoutDevnet
}
