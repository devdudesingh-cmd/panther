import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.NODE_ENV = "test";
process.env.FRAMES_WS_SECRET = "frames-secret";
process.env.AGENT_API_KEY = "agent-key";

const { verifyBridgeToken, verifyRecallUpgrade } = await import("./server.mjs");

test("bridge token verification matches the Next.js signer", () => {
  const sid = "11111111-1111-1111-1111-111111111111";
  const exp = Math.floor(Date.now() / 1000) + 60;
  const mac = createHmac("sha256", "frames-secret").update(`${sid}.${exp}`).digest("base64url");
  assert.equal(verifyBridgeToken(sid, `${exp}.${mac}`), true);
  assert.equal(verifyBridgeToken("other", `${exp}.${mac}`), false);
  assert.equal(verifyBridgeToken(sid, `${exp - 120}.${mac}`), false);
});

test("Recall upgrade signature (empty payload)", () => {
  const secret = "whsec_" + Buffer.from("k").toString("base64");
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = "v1," + createHmac("sha256", Buffer.from("k")).update(`id1.${ts}.`).digest("base64");
  assert.equal(verifyRecallUpgrade({ "webhook-id": "id1", "webhook-timestamp": ts, "webhook-signature": sig }, secret), true);
  assert.equal(verifyRecallUpgrade({ "webhook-id": "id2", "webhook-timestamp": ts, "webhook-signature": sig }, secret), false);
});
