import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { signBridgeToken, verifyBridgeToken } from "@/lib/bridge-token";
import { verifyRecallWebhook } from "@/lib/providers/recall";

describe("bridge tokens", () => {
  beforeAll(() => {
    process.env.FRAMES_WS_SECRET = "unit-secret";
  });

  it("round-trips and binds to the session id", () => {
    const t = signBridgeToken("11111111-1111-1111-1111-111111111111", 60);
    expect(verifyBridgeToken("11111111-1111-1111-1111-111111111111", t)).toBe(true);
    expect(verifyBridgeToken("22222222-2222-2222-2222-222222222222", t)).toBe(false);
    expect(verifyBridgeToken("11111111-1111-1111-1111-111111111111", t + "x")).toBe(false);
    expect(verifyBridgeToken("11111111-1111-1111-1111-111111111111", null)).toBe(false);
  });

  it("expires", () => {
    const t = signBridgeToken("s", 60, 1_000_000_000_000);
    expect(verifyBridgeToken("s", t, 1_000_000_000_000 + 59_000)).toBe(true);
    expect(verifyBridgeToken("s", t, 1_000_000_000_000 + 61_000)).toBe(false);
  });
});

describe("Recall request verification", () => {
  const secret = "whsec_" + Buffer.from("super-secret-key").toString("base64");
  const body = JSON.stringify({ event: "bot.done", data: { bot: { id: "b1" }, data: { code: "done" } } });

  function sign(id: string, ts: string, payload: string) {
    const key = Buffer.from(secret.slice(6), "base64");
    return "v1," + createHmac("sha256", key).update(`${id}.${ts}.${payload}`).digest("base64");
  }

  it("accepts a valid webhook-* signature and a legacy svix-* one", () => {
    const now = 1_700_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const h1 = new Headers({ "webhook-id": "msg_1", "webhook-timestamp": ts, "webhook-signature": sign("msg_1", ts, body) });
    expect(verifyRecallWebhook(body, h1, secret, now)).toBe(true);
    const h2 = new Headers({ "svix-id": "msg_2", "svix-timestamp": ts, "svix-signature": `v0,junk ${sign("msg_2", ts, body)}` });
    expect(verifyRecallWebhook(body, h2, secret, now)).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets and stale timestamps", () => {
    const now = 1_700_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const good = new Headers({ "webhook-id": "m", "webhook-timestamp": ts, "webhook-signature": sign("m", ts, body) });
    expect(verifyRecallWebhook(body + " ", good, secret, now)).toBe(false);
    expect(verifyRecallWebhook(body, good, "whsec_" + Buffer.from("other").toString("base64"), now)).toBe(false);
    expect(verifyRecallWebhook(body, good, secret, now + 10 * 60_000)).toBe(false);
    expect(verifyRecallWebhook(body, new Headers(), secret, now)).toBe(false);
  });

  it("verifies websocket upgrades (empty payload) the same way", () => {
    const now = 1_700_000_000_000;
    const ts = String(Math.floor(now / 1000));
    const h = new Headers({ "webhook-id": "ws", "webhook-timestamp": ts, "webhook-signature": sign("ws", ts, "") });
    expect(verifyRecallWebhook("", h, secret, now)).toBe(true);
  });
});
