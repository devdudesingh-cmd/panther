import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = ["/", "/pricing", "/safety", "/parent-notice", "/privacy", "/terms"];

for (const path of pages) {
  test(`${path} renders, has no axe violations and no layout shift`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(path);
    await expect(page.locator("main#main")).toBeVisible();
    await expect(page).toHaveTitle(/Panther/);
    // Let the hero intro finish so axe measures final colors, not mid-fade ones.
    if ((await page.locator(".hero-after").count()) > 0) {
      await page.waitForFunction(() => Array.from(document.querySelectorAll<HTMLElement>(".hero-after")).every((el) => getComputedStyle(el).opacity === "1"), null, { timeout: 10_000 });
    }

    // Scroll through so scroll-triggered reveals run, then measure CLS.
    await page.evaluate(async () => {
      const h = document.documentElement.scrollHeight;
      for (let y = 0; y < h; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    const cls = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let total = 0;
          const po = new PerformanceObserver((l) => {
            for (const e of l.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) {
              if (!e.hadRecentInput) total += e.value;
            }
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
    expect(axe.violations, JSON.stringify(axe.violations.map((v) => `${v.id}: ${v.nodes[0]?.target}`), null, 2)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("hero math card: wrong answer nudges, right answer celebrates and moves on", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("group", { name: "Try a quick math problem" });
  await expect(card).toBeVisible();
  const prompt = await card.locator(".display span").first().textContent();
  const [a, op, b] = prompt!.replace(/\s+/g, " ").trim().split(" ");
  const answer = op === "+" ? Number(a) + Number(b) : op === "−" ? Number(a) - Number(b) : op === "×" ? Number(a) * Number(b) : Number(a) / Number(b);

  // Wrong first
  await card.getByRole("button", { name: "Enter 9" }).click();
  await card.getByRole("button", { name: "Enter 9" }).click();
  await card.getByRole("button", { name: "Enter 9" }).click();
  await card.getByRole("button", { name: "Check answer" }).click();
  await expect(card.getByRole("status")).toContainText(/Close|Not quite|check/i);
  await card.getByRole("button", { name: "Delete last digit" }).click({ clickCount: 3 });

  // Then right
  for (const d of String(answer)) await card.getByRole("button", { name: `Enter ${d}` }).click();
  await card.getByRole("button", { name: "Check answer" }).click();
  await expect(card.getByText(/1 in a row/)).toBeVisible();
  await expect(page.locator(".panther[data-mood='cheer']")).toHaveCount(1);
  // next problem arrives
  await expect(card.locator(".display span").first()).not.toHaveText(prompt!, { timeout: 4000 });
});

test("hero math card works from the keyboard", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("group", { name: "Try a quick math problem" });
  await card.focus();
  await page.keyboard.type("12");
  await expect(card.getByLabel("Your answer: 12")).toBeVisible();
  await page.keyboard.press("Backspace");
  await expect(card.getByLabel("Your answer: 1")).toBeVisible();
});

test("primary navigation and skip link are keyboard reachable", async ({ page }) => {
  await page.goto("/pricing");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main")).toBeInViewport();
});
