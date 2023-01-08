import { IPublisher } from '../publisher/IPublisher'

export class NullPublisher implements IPublisher {
  start (): void {
  }

  stop (): void {
  }

  async publish (tick: any): Promise<void> {
  }
}
