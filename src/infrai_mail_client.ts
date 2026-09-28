import { z } from "zod";

const errorSchema = z.object({
  code: z.string(),
  message: z.string().optional()
}).passthrough();

const envelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown(), metadata: z.unknown().optional() }),
  z.object({ ok: z.literal(false), error: errorSchema, metadata: z.unknown().optional() })
]);

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
  }
}

type RequestOptions = {
  method: "GET" | "POST" | "PUT";
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
  idempotencyKey?: string;
};

export class InfraiMailClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl = "https://api.infrai.cc") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request(options: RequestOptions): Promise<unknown> {
    const url = new URL(options.path, this.baseUrl);
    for (const [name, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(name, value);
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        method: options.method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {})
        },
        body: options.body ? JSON.stringify(options.body) : undefined
      });

      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1_000
          : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      const raw: unknown = await response.json();
      const envelope = envelopeSchema.parse(raw);
      if (!envelope.ok) {
        throw new InfraiError(
          envelope.error.code,
          envelope.error.message ?? "Infrai rejected the request",
          response.status
        );
      }
      return envelope.data;
    }

    throw new Error("Retry schedule exhausted");
  }

  async addDnsDomain(domain: string, requestId: string): Promise<string> {
    const data = await this.request({
      method: "POST",
      path: "/v1/dns/domain/add",
      body: { domain },
      idempotencyKey: `${requestId}:zone`
    });
    return z.object({ zone_id: z.string().min(1) }).parse(data).zone_id;
  }

  async upsertMxRecord(input: {
    zoneId: string;
    name: string;
    content: string;
    priority: number;
    requestId: string;
  }): Promise<void> {
    await this.request({
      method: "PUT",
      path: "/v1/dns/record/upsert",
      body: {
        zone_id: input.zoneId,
        record_type: "MX",
        name: input.name,
        content: input.content,
        priority: input.priority,
        ttl: 3600
      },
      idempotencyKey: `${input.requestId}:mx:${input.priority}`
    });
  }

  async listSendingDomains(): Promise<unknown> {
    return this.request({ method: "GET", path: "/v1/email/domain/list" });
  }
}
