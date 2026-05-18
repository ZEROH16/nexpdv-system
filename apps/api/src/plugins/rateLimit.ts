import type { FastifyInstance } from "fastify";
import { config } from "../config.js";

interface Bucket {
  count: number;
  resetAt: number;
}

export const registerRateLimit = async (app: FastifyInstance) => {
  const buckets = new Map<string, Bucket>();

  app.addHook("onRequest", async (request, reply) => {
    const key = request.ip || "unknown";
    const now = Date.now();
    const current = buckets.get(key);
    const bucket = current && current.resetAt > now ? current : { count: 0, resetAt: now + config.RATE_LIMIT_WINDOW_MS };
    bucket.count += 1;
    buckets.set(key, bucket);

    reply.header("x-ratelimit-limit", String(config.RATE_LIMIT_MAX));
    reply.header("x-ratelimit-remaining", String(Math.max(config.RATE_LIMIT_MAX - bucket.count, 0)));
    reply.header("x-ratelimit-reset", String(bucket.resetAt));

    if (bucket.count > config.RATE_LIMIT_MAX) {
      return reply.code(429).send({ message: "Muitas requisicoes. Aguarde alguns instantes." });
    }
  });

  app.addHook("onResponse", async () => {
    if (buckets.size < 1000) return;
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  });
};

