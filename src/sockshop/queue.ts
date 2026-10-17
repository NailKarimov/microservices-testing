import amqp, { Channel, ChannelModel } from 'amqplib';
import { env } from '../../config/env';

/** The queue the orders service publishes a shipping task to after a successful order. */
const SHIPPING_TASK_QUEUE = 'shipping-task';

export type ShippingTask = { routingKey: string; contentType: string; body: unknown };

/**
 * Thin client over the `shipping-task` queue. No queue-master runs in this compose file, so
 * messages stay put until a test reads them — there is nothing else competing for them.
 */
export class ShippingQueue {
  private connection?: ChannelModel;

  async connect(): Promise<void> {
    this.connection = await amqp.connect(env.sockShop.amqp);
    // A broker-side error (e.g. the container is stopped mid-test) must not crash the process.
    this.connection.on('error', () => {});
  }

  /** Runs one operation on a fresh channel and closes it, so a 404 (queue not declared yet) never
   *  leaves a broken channel behind. */
  private async withChannel<T>(fn: (channel: Channel) => Promise<T>): Promise<T> {
    const channel = await this.connection!.createChannel();
    channel.on('error', () => {});
    try {
      return await fn(channel);
    } finally {
      await channel.close().catch(() => {});
    }
  }

  /** Empties the queue. Safe to call even before the queue exists. */
  async purge(): Promise<void> {
    await this.withChannel(async (channel) => {
      await channel.purgeQueue(SHIPPING_TASK_QUEUE).catch(() => {});
    });
  }

  /** Numbers of messages currently waiting. 0 if the queue does not exist (yet). */
  async messageCount(): Promise<number> {
    return this.withChannel(async (channel) => {
      const info = await channel.checkQueue(SHIPPING_TASK_QUEUE).catch(() => undefined);
      return info?.messageCount ?? 0;
    });
  }

  /** Reads and acknowledges the oldest message, or `undefined` if the queue is empty. */
  async take(): Promise<ShippingTask | undefined> {
    return this.withChannel(async (channel) => {
      const msg = await channel.get(SHIPPING_TASK_QUEUE, { noAck: false }).catch(() => false as const);
      if (!msg) return undefined;
      channel.ack(msg);
      return {
        routingKey: msg.fields.routingKey,
        contentType: msg.properties.contentType as string,
        body: JSON.parse(msg.content.toString()),
      };
    });
  }

  /**
   * Waits for the next message: the orders service publishes asynchronously, so the task may land a
   * moment after the HTTP response. Polls until a message arrives or the timeout runs out.
   */
  async takeWithin(timeoutMs = 10_000, intervalMs = 250): Promise<ShippingTask | undefined> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const task = await this.take();
      if (task || Date.now() >= deadline) return task;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  async close(): Promise<void> {
    await this.connection?.close().catch(() => {});
  }

  /** Connects with retries, for use right after the broker container is restarted. */
  static async connectWithRetry(attempts = 10, delayMs = 1_000): Promise<ShippingQueue> {
    for (let i = 1; i <= attempts; i++) {
      try {
        const queue = new ShippingQueue();
        await queue.connect();
        return queue;
      } catch (error) {
        if (i === attempts) throw error;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    throw new Error('unreachable');
  }
}
