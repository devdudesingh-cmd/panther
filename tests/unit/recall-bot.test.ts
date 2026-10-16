import { beforeAll, describe, expect, it } from "vitest";
import { buildBotRequest } from "@/lib/providers/recall";
import { verifyBridgeToken } from "@/lib/bridge-token";

describe("Recall Create Bot payload", () => {
  beforeAll(() => {
    process.env.FRAMES_WS_SECRET = "unit-secret";
  });
  const input = { sessionId: "11111111-1111-1111-1111-111111111111", meetUrl: "https://meet.google.com/abc-defg-hij", joinAt: "2026-11-03T22:58:00.000Z" };

  it("schedules a bot whose camera renders our signed /bridge page", () => {
    const req = buildBotRequest(input, { siteUrl: "https://panther.test", botName: "Panther Tutor" });
    expect(req.meeting_url).toBe(input.meetUrl);
    expect(req.join_at).toBe(input.joinAt);
    expect(req.bot_name).toBe("Panther Tutor");
    expect(req.metadata).toEqual({ session_id: input.sessionId });
    const url = new URL(req.output_media.camera.config.url);
    expect(url.origin + url.pathname).toBe("https://panther.test/bridge");
    expect(url.searchParams.get("session")).toBe(input.sessionId);
    expect(verifyBridgeToken(input.sessionId, url.searchParams.get("t"))).toBe(true);
    expect(req.output_media.camera.kind).toBe("webpage");
  });

  it("requests no stored artifacts and the shortest retention; leaves when everyone leaves", () => {
    const req = buildBotRequest(input, { siteUrl: "https://panther.test", botName: "T" });
    expect(req.recording_config.retention).toEqual({ type: "timed", hours: 1 });
    expect("realtime_endpoints" in req.recording_config).toBe(false);
    expect(Object.keys(req.recording_config)).toEqual(["retention"]);
    expect(req.automatic_leave.everyone_left_timeout).toBe(60);
  });

  it("adds the frames websocket only when the realtime service is configured", () => {
    const req = buildBotRequest(input, { siteUrl: "https://panther.test", botName: "T", framesWsUrl: "wss://frames.panther.test/" });
    const rc = req.recording_config as { realtime_endpoints?: { type: string; url: string; events: string[] }[] };
    expect(rc.realtime_endpoints).toHaveLength(1);
    const ep = rc.realtime_endpoints![0];
    expect(ep.type).toBe("websocket");
    const u = new URL(ep.url);
    expect(u.protocol).toBe("wss:");
    expect(u.pathname).toBe("/ingest");
    expect(u.searchParams.get("session")).toBe(input.sessionId);
    expect(verifyBridgeToken(input.sessionId, u.searchParams.get("t"))).toBe(true);
    expect(ep.events).toContain("video_separate_png.data");
    expect(ep.events).toContain("audio_mixed_raw.data");
  });
});
