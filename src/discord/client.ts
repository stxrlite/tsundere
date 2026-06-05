import { EventEmitter } from "node:events";
import type { DiscordEvents, EventName, Partials, Snowflake, User } from "./types.js";
import { REST } from "./rest.js";
import { CacheManager } from "./cache.js";

export interface ClientOptions {
  token?: string;
  intents: number[];
  partials?: Partials[];
  shards?: number | "auto";
  rest?: {
    apiBase?: string;
  };
}

export class Client {
  readonly rest: REST;
  readonly cache = new CacheManager();
  readonly events = new EventEmitter();
  readonly intents: number[];
  readonly partials: Partials[];
  readonly shards: number | "auto";
  token?: string;
  user: User = { id: "0", username: "Tsundere", tag: "Tsundere#0000" };
  ping = 0;

  constructor(options: ClientOptions) {
    if (options.token !== undefined) {
      this.token = options.token;
    }
    this.intents = options.intents;
    this.partials = options.partials ?? [];
    this.shards = options.shards ?? 1;
    this.rest = new REST({
      ...(options.token !== undefined ? { token: options.token } : {}),
      ...(options.rest?.apiBase !== undefined ? { apiBase: options.rest.apiBase } : {})
    });
  }

  on<Name extends EventName>(event: Name, listener: (...args: DiscordEvents[Name]) => void): this {
    this.events.on(event, listener as (...args: unknown[]) => void);
    return this;
  }

  once<Name extends EventName>(event: Name, listener: (...args: DiscordEvents[Name]) => void): this {
    this.events.once(event, listener as (...args: unknown[]) => void);
    return this;
  }

  emit<Name extends EventName>(event: Name, ...args: DiscordEvents[Name]): boolean {
    return this.events.emit(event, ...args);
  }

  async login(token = this.token): Promise<void> {
    if (!token) {
      throw new Error("Missing Discord token. Pass token to Client or login(token).");
    }
    this.token = token;
    this.rest.setToken(token);
    await this.connectGateway();
  }

  async connectGateway(): Promise<void> {
    this.ping = 1;
    queueMicrotask(() => this.emit("ready"));
  }

  async shard(id: number): Promise<ShardHandle> {
    return { id, status: "ready", latency: this.ping };
  }
}

export interface ShardHandle {
  id: number;
  status: "starting" | "ready" | "reconnecting" | "closed";
  latency: number;
}

export function snowflake(value: string): Snowflake {
  if (!/^\d{5,}$/u.test(value)) {
    throw new Error(`Invalid Discord snowflake: ${value}`);
  }
  return value;
}
