import type { Client } from "./client.js";
import type { Interaction } from "./types.js";

export interface CollectorOptions<T> {
  filter?: (value: T) => boolean;
  timeout?: number;
  max?: number;
}

export class Collector<T> implements AsyncIterable<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<(result: IteratorResult<T>) => void> = [];
  private ended = false;
  private collected = 0;
  private timer?: NodeJS.Timeout;

  constructor(private readonly options: CollectorOptions<T> = {}) {
    if (options.timeout) {
      this.timer = setTimeout(() => this.stop(), options.timeout);
    }
  }

  collect(value: T): void {
    if (this.ended || (this.options.filter && !this.options.filter(value))) {
      return;
    }
    if (this.waiters.length > 0) {
      this.waiters.shift()?.({ value, done: false });
    } else {
      this.values.push(value);
    }
    this.collected += 1;
    if (this.options.max && this.collected >= this.options.max) {
      this.stop();
    }
  }

  stop(): void {
    this.ended = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    while (this.waiters.length > 0) {
      this.waiters.shift()?.({ value: undefined, done: true });
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.values.length > 0) {
          const value = this.values.shift() as T;
          return Promise.resolve({ value, done: false });
        }
        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => this.waiters.push(resolve));
      }
    };
  }
}

export function componentCollector(client: Client, options: CollectorOptions<Interaction> = {}): Collector<Interaction> {
  const collector = new Collector<Interaction>(options);
  client.on("interactionCreate", (interaction) => {
    if (interaction.isButton() || interaction.isSelectMenu()) {
      collector.collect(interaction);
    }
  });
  return collector;
}

export function modalCollector(client: Client, options: CollectorOptions<Interaction> = {}): Collector<Interaction> {
  const collector = new Collector<Interaction>(options);
  client.on("interactionCreate", (interaction) => {
    if (interaction.isModalSubmit()) {
      collector.collect(interaction);
    }
  });
  return collector;
}
