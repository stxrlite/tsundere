export interface RESTOptions {
  token?: string;
  apiBase?: string;
}

export interface RESTRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  route: string;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface RESTResponse<T> {
  status: number;
  data: T;
  rateLimit?: RateLimitState;
}

export interface RateLimitState {
  bucket: string;
  remaining: number;
  resetAfter: number;
}

export class REST {
  private token?: string;
  private readonly apiBase: string;
  private readonly buckets = new Map<string, RateLimitState>();

  constructor(options: RESTOptions = {}) {
    if (options.token !== undefined) {
      this.token = options.token;
    }
    this.apiBase = options.apiBase ?? "https://discord.com/api/v10";
  }

  setToken(token: string): void {
    this.token = token;
  }

  async request<T>(request: RESTRequest): Promise<RESTResponse<T>> {
    const bucket = this.bucketFor(request.method, request.route);
    const state = this.buckets.get(bucket);
    if (state && state.remaining <= 0) {
      await delay(state.resetAfter);
    }

    const init: RequestInit = {
      method: request.method,
      headers: {
        "content-type": "application/json",
        ...(this.token ? { authorization: `Bot ${this.token}` } : {}),
        ...request.headers
      }
    };
    if (request.body !== undefined) {
      init.body = JSON.stringify(request.body);
    }
    const response = await fetch(`${this.apiBase}${request.route}`, init);

    this.buckets.set(bucket, {
      bucket,
      remaining: Number(response.headers.get("x-ratelimit-remaining") ?? "1"),
      resetAfter: Number(response.headers.get("x-ratelimit-reset-after") ?? "0") * 1000
    });

    const text = await response.text();
    const data = text ? JSON.parse(text) as T : undefined as T;
    const rateLimit = this.buckets.get(bucket);
    return rateLimit ? { status: response.status, data, rateLimit } : { status: response.status, data };
  }

  get<T>(route: string): Promise<RESTResponse<T>> {
    return this.request<T>({ method: "GET", route });
  }

  post<T>(route: string, body?: unknown): Promise<RESTResponse<T>> {
    return this.request<T>(body === undefined ? { method: "POST", route } : { method: "POST", route, body });
  }

  put<T>(route: string, body?: unknown): Promise<RESTResponse<T>> {
    return this.request<T>(body === undefined ? { method: "PUT", route } : { method: "PUT", route, body });
  }

  patch<T>(route: string, body?: unknown): Promise<RESTResponse<T>> {
    return this.request<T>(body === undefined ? { method: "PATCH", route } : { method: "PATCH", route, body });
  }

  delete<T>(route: string): Promise<RESTResponse<T>> {
    return this.request<T>({ method: "DELETE", route });
  }

  private bucketFor(method: string, route: string): string {
    return `${method}:${route.replace(/\d{5,}/gu, ":id")}`;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
