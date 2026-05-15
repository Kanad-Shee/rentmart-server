/// <reference types="bun-types" />

import { describe, expect, it } from "bun:test";
import { createRateLimiter } from "../middlewares/rate-limit.middleware";

function createMockResponse() {
  const headers = new Map<string, string>();
  let statusCode = 200;
  let payload: unknown;

  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: unknown) {
      payload = data;
      return this;
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
      return this;
    },
  };

  return {
    headers,
    get payload() {
      return payload;
    },
    get statusCode() {
      return statusCode;
    },
    response,
  };
}

describe("rate limit middleware", () => {
  it("blocks requests after the configured limit", async () => {
    const limiter = createRateLimiter({
      keyPrefix: `rate:test:${Date.now()}`,
      limit: 1,
      message: "Too many attempts.",
      windowMs: 60 * 1000,
      getIdentifier: () => "testing@example.com",
    });

    const req = {
      body: {
        email: "testing@example.com",
      },
      ip: "127.0.0.1",
    } as never;

    const first = createMockResponse();
    let firstNextCalled = false;

    await limiter(req, first.response as never, () => {
      firstNextCalled = true;
    });

    expect(firstNextCalled).toBe(true);
    expect(first.statusCode).toBe(200);

    const second = createMockResponse();
    let secondNextCalled = false;

    await limiter(req, second.response as never, () => {
      secondNextCalled = true;
    });

    expect(secondNextCalled).toBe(false);
    expect(second.statusCode).toBe(429);
    expect(second.payload).toMatchObject({
      success: false,
      message: "Too many attempts.",
    });
  });
});
