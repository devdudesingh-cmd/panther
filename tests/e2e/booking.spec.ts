import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/** Fake /api/slots: two open days with a couple of times each, in UTC. */
async function mockSlots(page: Page) {
  await page.route("**/api/slots?*", async (route) => {
    const url = new URL(route.request().url());
    const from = url.searchParams.get("from")!;
    const d1 = new Date(`${from}T00:00:00Z`);
    d1.setUTCDate(d1.getUTCDate() + 3);
    const d2 = new Date(d1);
    d2.setUTCDate(d2.getUTCDate() + 1);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const at = (d: Date, h: number) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, 0)).toISOString();
    const slot = (d: Date, h: number, seats: number) => ({ startsAt: at(d, h), endsAt: at(d, h + 1), seatsLeft: seats });
    await route.fulfill({
      json: {
        slots: {
          [day(d1)]: [slot(d1, 23, 3), slot(d1, 23.5, 1)],
          [day(d2)]: [slot(d2, 22, 2)],
        },
      },
    });
  });
}

test("booking wizard: choose a session type, see slots in my time zone, pick one", async ({ page }) => {
  await mockSlots(page);
  await page.goto("/book");
  await expect(page.getByRole("heading", { name: "What would you like to book?" })).toBeVisible();

  // Default is the free trial; switch to paid and back.
  const paid = page.getByRole("button", { name: /40-minute session/ });
  await paid.click();
  await expect(paid).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Pick a time →" }).click();

  await expect(page.getByRole("heading", { name: "Pick a time" })).toBeVisible();
  await expect(page.getByText(/40-minute session\. Times shown in your time zone/)).toBeVisible();

  // Days with slots are enabled; the first open day is selected automatically.
  const openDays = page.getByRole("option").filter({ has: page.locator("span.bg-red, span.bg-sun") });
  await expect(openDays.first()).toBeVisible();
  const times = page.getByRole("listbox", { name: "Pick a time" }).getByRole("option");
  await expect(times).toHaveCount(2);
  await expect(page.getByText("last spot")).toBeVisible();

  const continueBtn = page.getByRole("button", { name: "Continue →" });
  await expect(continueBtn).toBeDisabled();
  await times.first().click();
  await expect(times.first()).toHaveAttribute("aria-selected", "true");
  await expect(continueBtn).toBeEnabled();
  await continueBtn.click();

  // Step 3 asks for the email code (no Supabase here, so we stop at the form).
  await expect(page.getByRole("heading", { name: "About you" })).toBeVisible();
  await expect(page.getByLabel("Your email")).toBeVisible();

  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(axe.violations).toEqual([]);
});

test("?kind=trial deep link skips straight to the calendar and shows the cancelled notice", async ({ page }) => {
  await mockSlots(page);
  await page.goto("/book?kind=trial&cancelled=abc");
  await expect(page.getByRole("heading", { name: "Pick a time" })).toBeVisible();
  await expect(page.getByText(/25-minute trial\. Times shown/)).toBeVisible();
  await expect(page.getByText(/checkout was cancelled and nothing was charged/)).toBeVisible();
});

test("time zone selector re-queries slots with the new zone", async ({ page }) => {
  const seen: string[] = [];
  await page.route("**/api/slots?*", async (route) => {
    seen.push(new URL(route.request().url()).searchParams.get("tz")!);
    await route.fulfill({ json: { slots: {} } });
  });
  await page.goto("/book?kind=paid");
  await expect(page.getByText("No open times in this range")).toBeVisible();
  await page.getByLabel("Time zone").selectOption("America/New_York");
  await expect.poll(() => seen.at(-1)).toBe("America/New_York");
});

test("post-checkout page only polls and reflects the webhook's decision", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/bookings/sess-1", async (route) => {
    calls++;
    await route.fulfill({
      json: {
        id: "sess-1",
        kind: "paid",
        status: calls < 2 ? "held" : "confirmed",
        startsAt: "2026-11-03T23:00:00.000Z",
        endsAt: "2026-11-03T23:40:00.000Z",
        meetUrl: calls < 2 ? null : "https://meet.google.com/abc-defg-hij",
        parentTz: "America/New_York",
        cancelReason: null,
        fulfilled: calls >= 2,
      },
    });
  });
  await page.goto("/book/done?session=sess-1");
  await expect(page.getByRole("heading", { name: /Confirming with Stripe/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "See you on the Meet!" })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("link", { name: "https://meet.google.com/abc-defg-hij" })).toBeVisible();
  await expect(page.getByText("Tuesday, November 3 · 6:00 PM EST")).toBeVisible();
  expect(calls).toBeGreaterThanOrEqual(2);
});

test("post-checkout page explains a refused second trial", async ({ page }) => {
  await page.route("**/api/bookings/sess-2", (route) =>
    route.fulfill({
      json: { id: "sess-2", kind: "trial", status: "cancelled", startsAt: "2026-11-03T23:00:00.000Z", endsAt: "2026-11-03T23:25:00.000Z", meetUrl: null, parentTz: "America/New_York", cancelReason: "trial_already_used", fulfilled: false },
    }),
  );
  await page.goto("/book/done?session=sess-2");
  await expect(page.getByText(/already used its free trial/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Pick another time" })).toHaveAttribute("href", "/book?kind=paid");
});

test("dashboard requires a signed-in parent", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
  await expect(page.getByLabel("Your email")).toBeVisible();
});

test("login page validates the email before sending a code", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Your email").fill("someone@localhost"); // passes the browser check, fails ours
  await page.getByRole("button", { name: "Send me a code" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /look right/ })).toBeVisible();
});

for (const path of ["/book?kind=paid", "/login"]) {
  test(`${path} has no layout shift or axe violations`, async ({ page }) => {
    await mockSlots(page);
    await page.goto(path);
    await expect(page.locator("main#main")).toBeVisible();
    await page.waitForTimeout(1200);
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          const po = new PerformanceObserver((l) => {
            for (const e of l.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) if (!e.hadRecentInput) total += e.value;
          });
          po.observe({ type: "layout-shift", buffered: true });
          setTimeout(() => {
            po.disconnect();
            resolve(total);
          }, 200);
        }),
    );
    expect(cls).toBeLessThan(0.1);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(axe.violations, JSON.stringify(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`))).toEqual([]);
  });
}
