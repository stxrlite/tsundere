import type { Channel, Guild, Member, Message, Role, Snowflake, User } from "./types.js";

export class TypedCache<T extends { id: Snowflake }> {
  private readonly values = new Map<Snowflake, T>();

  get(id: Snowflake): T | undefined {
    return this.values.get(id);
  }

  set(value: T): T {
    this.values.set(value.id, value);
    return value;
  }

  delete(id: Snowflake): boolean {
    return this.values.delete(id);
  }

  all(): T[] {
    return [...this.values.values()];
  }

  clear(): void {
    this.values.clear();
  }
}

export class CacheManager {
  readonly users = new TypedCache<User>();
  readonly guilds = new TypedCache<Guild>();
  readonly channels = new TypedCache<Channel>();
  readonly roles = new TypedCache<Role>();
  readonly members = new TypedCache<Member>();
  readonly messages = new TypedCache<Message>();
}
