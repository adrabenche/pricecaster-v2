/**
 * Pricecaster Service.
 *
 * Rest API Component.
 *
 * Copyright 2022, 2023 Randlabs Inc.
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

import { IAppSettings } from '../common/settings'
import { Statistics } from './Stats'
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify'
import * as Logger from '@randlabs/js-logger'
import { SlotLayout } from '../common/slotLayout'

const assetRegisterSchema = {
  schema: {
    body: {
      type: 'object',
      required: ['asaId', 'priceId'],
      properties: {
        asaId: { type: 'number' },
        priceId: {
          type: 'string',
          maxLength: 64,
          minLength: 64,
          pattern: '^[a-fA-F0-9]+$/g'
        },
        slotHint: { type: 'number' }
      }
    }
  }
}

type AssetRegisterBody = {
  asaId: number,
  priceId: string,
  slotHint?: number
}

export class RestApi {
  private server: FastifyInstance

  constructor (readonly settings: IAppSettings,
    readonly slotLayout: SlotLayout,
    readonly stats: Statistics) {
    this.server = Fastify({ logger: true })
  }

  async init () {
    this.server.get('/stats', async (req, reply) => {
      return this.stats.getTxStats()
    })

    this.server.post('/stats/reset', async (req, reply) => {
      this.stats.resetStats()
    })

    this.server.get('/health', async (req, reply) => ({
      health: 'ok'
    }))

    this.server.post('/asset/register', async (req: FastifyRequest<{ Body: AssetRegisterBody }>, reply) => {
      // ensure we are still consistent!

      const { asaId, priceId, slotHint } = req.body

      if (this.slotLayout.getDatabaseSlotCount() !== await this.slotLayout.getPricecasterSlotcount()) {
        reply.code(500).send(new Error('Onchain and local databases are inconsistent, cannot proceed'))
      }

      if (slotHint !== this.slotLayout.getDatabaseSlotCount()) {
        reply.code(400).send(new Error('Slot hint invalid'))
      }

      const slotId = await this.slotLayout.allocSlot(asaId, priceId)
      return { slotId }
    })

    await this.server.listen({ port: this.settings.rest.port })
  }

  async stop () {
    Logger.info('Shutting down Rest API server...')
    await this.server.close()
  }
}
