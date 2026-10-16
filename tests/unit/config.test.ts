import { describe, expect, it } from "vitest";
import { config, formatPrice, sessionMinutes, sessionPriceCents } from "@/config";

/** WCAG 2.x relative luminance + contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = hex
    .replace("#", "")
    .match(/.{2}/g)!
    .map((h) => parseInt(h, 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe("config", () => {
  it("has sane session rules", () => {
    expect(config.sessions.trialMinutes).toBeGreaterThan(0);
    expect(config.sessions.paidMinutes).toBeGreaterThan(config.sessions.trialMinutes);
    expect(config.sessions.maxSimultaneous).toBeGreaterThanOrEqual(1);
    expect(config.sessions.holdMinutes).toBe(10);
    // Recall only guarantees on-time joins for bots scheduled >10 min ahead.
    expect(config.sessions.minLeadMinutes - config.sessions.tutorJoinLeadMinutes).toBeGreaterThan(10);
  });

  it("business hours are well-formed HH:mm windows in LA time", () => {
    expect(config.businessHours.timeZone).toBe("America/Los_Angeles");
    for (const windows of Object.values(config.businessHours.windows)) {
      for (const w of windows) {
        expect(w.start).toMatch(/^\d{2}:\d{2}$/);
        expect(w.end).toMatch(/^\d{2}:\d{2}$/);
        expect(w.start < w.end).toBe(true);
      }
    }
  });

  it("helpers", () => {
    expect(sessionMinutes("trial")).toBe(config.sessions.trialMinutes);
    expect(sessionMinutes("paid")).toBe(config.sessions.paidMinutes);
    expect(sessionPriceCents("trial")).toBe(0);
    expect(sessionPriceCents("paid")).toBe(1900);
    expect(formatPrice(1900)).toBe("$19");
    expect(formatPrice(1950)).toBe("$19.50");
  });

  it("brand colors meet WCAG AA (4.5:1) for text", () => {
    const { red, paper, ink } = config.brand.colors;
    const white = "#ffffff";
    expect(contrast(red, paper)).toBeGreaterThanOrEqual(4.5); // red text on paper
    expect(contrast(white, red)).toBeGreaterThanOrEqual(4.5); // white text on red buttons
    expect(contrast(ink, paper)).toBeGreaterThanOrEqual(7); // body text
    expect(contrast("#5e4542", paper)).toBeGreaterThanOrEqual(4.5); // ink-soft on paper
    expect(contrast("#8a7572", paper)).toBeGreaterThanOrEqual(3); // ink-faint only for large/placeholder text
  });
});
