import "dotenv/config";
import { createClient, type RedisClientType } from "redis";

type RateLimitCounterResult = {
  backend: "memory" | "redis";
  count: number;
  ttlSeconds: number;
};

type MemoryRateLimitEntry = {
  count: number;
  expiresAt: number;
};

let redisClient: RedisClientType | null = null;
let redisClientPromise: Promise<RedisClientType | null> | null = null;
const memoryRateLimitStore = new Map<string, MemoryRateLimitEntry>();

function getRedisUrl() {
  return process.env.REDIS_URL?.trim() || null;
}

function getMemoryRateLimitCounter(key: string, windowMs: number): RateLimitCounterResult {
  const now = Date.now();
  const existingEntry = memoryRateLimitStore.get(key);

  if (!existingEntry || existingEntry.expiresAt <= now) {
    const expiresAt = now + windowMs;
    memoryRateLimitStore.set(key, {
      count: 1,
      expiresAt,
    });

    return {
      backend: "memory",
      count: 1,
      ttlSeconds: Math.max(1, Math.ceil(windowMs / 1000)),
    };
  }

  existingEntry.count += 1;

  return {
    backend: "memory",
    count: existingEntry.count,
    ttlSeconds: Math.max(1, Math.ceil((existingEntry.expiresAt - now) / 1000)),
  };
}

async function getRedisClient() {
  const redisUrl = getRedisUrl();

  if (!redisUrl) {
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (redisClientPromise) {
    return redisClientPromise;
  }

  redisClientPromise = (async () => {
    try {
      redisClient = createClient({
        url: redisUrl,
      });

      redisClient.on("error", (error) => {
        console.error("Redis client error:", error);
      });

      await redisClient.connect();
      return redisClient;
    } catch (error) {
      redisClient = null;
      console.warn("Redis is unavailable, falling back to in-memory rate limit storage.");
      console.error(error);
      return null;
    } finally {
      redisClientPromise = null;
    }
  })();

  return redisClientPromise;
}

export async function incrementRateLimitCounter(
  key: string,
  windowMs: number
): Promise<RateLimitCounterResult> {
  const client = await getRedisClient();
  const ttlSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  if (!client) {
    return getMemoryRateLimitCounter(key, windowMs);
  }

  try {
    const count = await client.incr(key);

    if (count === 1) {
      await client.expire(key, ttlSeconds);
    }

    const ttl = await client.ttl(key);

    return {
      backend: "redis",
      count,
      ttlSeconds: ttl > 0 ? ttl : ttlSeconds,
    };
  } catch (error) {
    console.warn("Redis rate limit counter failed, using memory fallback.");
    console.error(error);
    return getMemoryRateLimitCounter(key, windowMs);
  }
}

export async function resetRateLimitCounter(key: string) {
  const client = await getRedisClient();

  if (client) {
    try {
      await client.del(key);
    } catch (error) {
      console.error("Failed to reset Redis rate limit counter:", error);
    }
  }

  memoryRateLimitStore.delete(key);
}

export type { RateLimitCounterResult };
