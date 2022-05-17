import { IPublisher, PublishInfo } from '../publisher/IPublisher'
import { StatusCode } from '../common/statusCodes'

export class NullPublisher implements IPublisher {
  start (): void {
  }

  stop (): void {
  }

  async publish (tick: any): Promise<PublishInfo> {
    return {
      status: StatusCode.NULL_DATA
    }
  }
}
