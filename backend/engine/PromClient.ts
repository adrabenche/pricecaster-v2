
/**
 * Pricecaster Service.
 *
 * Prometheus Client
 *
 * Copyright 2022, 2023  C3
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
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify'
import * as Logger from '@randlabs/js-logger'
import { Registry, collectDefaultMetrics } from 'prom-client'
import { Statistics } from './Stats'
import { getMetrics } from './Metrics'

export class PromClientApi {
  private promServer: FastifyInstance
  private registry: Registry

  constructor (readonly settings: IAppSettings, readonly stats: Statistics) {
    this.promServer = Fastify({ logger: true })
    this.registry = new Registry()
  }

  async init () {
    collectDefaultMetrics({ register: this.registry })
    getMetrics(this.stats).forEach(m => this.registry.registerMetric(m))

    this.promServer.get('/metrics', async (req, res) => {
      res.headers({ 'Content-Type': this.registry.contentType })
      return res.send(await this.registry.metrics())
    })

    await this.promServer.listen({ port: this.settings.prom.port, host: '0.0.0.0' })
  }

  async stop () {
    Logger.info('Shutting down Prometheus API server...')
    await this.promServer.close()
  }
}
