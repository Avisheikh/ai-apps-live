import { test, expect } from "@playwright/test";

test.describe("Broadcast Dashboard (/broadcast) Acceptance Criteria", () => {
  test.beforeEach(async ({ page }) => {
    // Set 1920x1080 fixed broadcast canvas viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
  });

  test("renders 1920x1080 fixed canvas with zero scrollbars", async ({ page }) => {
    await page.goto("/broadcast?country=us&tz=UTC");
    await page.waitForSelector("#broadcast-canvas");

    // 1. Exact geometry assertions
    const canvas = page.locator("#broadcast-canvas");
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBe(1920);
    expect(box!.height).toBe(1080);

    // 2. Ensure page has no scrollbars (no overflow)
    const dimensions = await page.evaluate(() => {
      return {
        bodyScrollWidth: document.body.scrollWidth,
        bodyScrollHeight: document.body.scrollHeight,
        docScrollWidth: document.documentElement.scrollWidth,
        docScrollHeight: document.documentElement.scrollHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        hasVerticalScroll: document.documentElement.scrollHeight > window.innerHeight,
      };
    });

    expect(dimensions.hasHorizontalScroll).toBe(false);
    expect(dimensions.hasVerticalScroll).toBe(false);
    expect(dimensions.docScrollWidth).toBeLessThanOrEqual(1920);
    expect(dimensions.docScrollHeight).toBeLessThanOrEqual(1080);
  });

  test("contains all required metric panels and layout columns", async ({ page }) => {
    await page.goto("/broadcast?country=us&tz=UTC");
    await page.waitForSelector("#broadcast-canvas");

    // Header assertions
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("header").getByText("AI APPS LIVE")).toBeVisible();
    await expect(page.locator("header").getByText("Dashboard Refresh")).toBeVisible();

    // Metric 1: App Store Popularity
    const appStorePanel = page.locator("#panel-app-store");
    await expect(appStorePanel).toBeVisible();
    await expect(appStorePanel.getByText("App Store Popularity", { exact: false })).toBeVisible();

    // Metric 2: Search Interest (Google Trends)
    const trendsPanel = page.locator("#panel-search-interest");
    await expect(trendsPanel).toBeVisible();
    await expect(trendsPanel.getByText("Search Interest", { exact: false })).toBeVisible();

    // Telemetry: 24h Rank Movement
    const rankPanel = page.locator("#panel-rank-movement");
    await expect(rankPanel).toBeVisible();
    await expect(rankPanel.getByText("Rank Movement", { exact: false })).toBeVisible();

    // Metric 3: Officially Reported Users
    const officialPanel = page.locator("#panel-official-users");
    await expect(officialPanel).toBeVisible();
    await expect(officialPanel.getByText("Officially Reported Users", { exact: false })).toBeVisible();

    // Metric 4: Concurrent Users
    const concurrentPanel = page.locator("#panel-concurrent-users");
    await expect(concurrentPanel).toBeVisible();
    await expect(concurrentPanel.getByText("Concurrent Users", { exact: false })).toBeVisible();

    // Footer assertions
    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
  });

  test("presents exact required attributions, disclaimers, and honest text", async ({ page }) => {
    await page.goto("/broadcast?country=us&tz=UTC");
    await page.waitForSelector("#broadcast-canvas");

    // 1. App Store attribution
    await expect(
      page.getByText("Source: Apple App Store charts")
    ).toBeVisible();

    // 2. Google Trends exact notice & attribution
    await expect(
      page.getByText("Relative index 0–100, not search volume")
    ).toBeVisible();
    await expect(
      page.getByText("Data source: Google Trends (https://www.google.com/trends)")
    ).toBeVisible();

    // 3. Concurrent Users panel exact text (Acceptance criteria requirement)
    await expect(
      page.getByText("Concurrent user data unavailable.")
    ).toBeVisible();
    await expect(
      page.getByText("No public source reports this.")
    ).toBeVisible();

    // Ensure NO fake numbers exist in the concurrent panel
    const concurrentText = await page.locator("#panel-concurrent-users").innerText();
    expect(concurrentText).not.toMatch(/\b[0-9]{1,3}(,[0-9]{3})+\b/); // no formatted numbers like 1,000
    expect(concurrentText).not.toContain("0 concurrent");

    // 4. Footer non-affiliation disclaimer
    await expect(
      page.getByText("Independent project. Not affiliated with any listed company.")
    ).toBeVisible();

    // 5. Distinctly labeled three timestamps
    await expect(page.locator("footer").getByText("Last Collection")).toBeVisible();
    await expect(page.locator("footer").getByText("Source Updated")).toBeVisible();
    await expect(page.locator("footer").getByText("Dashboard Refresh")).toBeVisible();
  });

  test("supports ?preview=1 responsive window scaling without distortion", async ({ page }) => {
    // Small preview viewport (e.g. 1280x720 developer laptop)
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/broadcast?preview=1");
    await page.waitForSelector("#broadcast-canvas");

    const canvas = page.locator("#broadcast-canvas");
    await expect(canvas).toBeVisible();

    // The canvas remains 1920x1080 internal dimensions
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    // Scaled bounding box fits within 1280x720 window
    expect(box!.width).toBeLessThanOrEqual(1280.1);
    expect(box!.height).toBeLessThanOrEqual(720.1);

    // No window scrollbars
    const hasScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth ||
             document.documentElement.scrollHeight > window.innerHeight;
    });
    expect(hasScroll).toBe(false);
  });

  test("captures visual broadcast screenshot in 1920x1080", async ({ page }) => {
    await page.goto("/broadcast?country=us&tz=UTC");
    await page.waitForSelector("#broadcast-canvas");

    // Wait 500ms for stable layout
    await page.waitForTimeout(500);

    // Save screenshot
    await page.screenshot({ path: "tests/fixtures/broadcast-screenshot-1080p.png" });
  });

  test("renders full-screen Top 50 chart without Metric 2 or 3 and with app downloads", async ({ page }) => {
    await page.goto("/broadcast?view=top50");
    await page.waitForSelector("#broadcast-canvas");

    // 1. Metric 2 and Metric 3 and Concurrent Users must NOT be visible
    await expect(page.locator("#panel-search-interest")).toHaveCount(0);
    await expect(page.locator("#panel-official-users")).toHaveCount(0);
    await expect(page.locator("#panel-concurrent-users")).toHaveCount(0);

    // 2. Full-screen Top 50 panel must be visible
    const top50Panel = page.locator("#panel-top50-fullscreen");
    await expect(top50Panel).toBeVisible();
    await expect(top50Panel.getByText("App Store Top 50 Free")).toBeVisible();

    // 3. All 50 download buttons/links must be present
    const downloadButtons = top50Panel.locator('a[href*="apps.apple.com"]');
    await expect(downloadButtons).toHaveCount(50);

    // 4. Zero scrollbars
    const dimensions = await page.evaluate(() => {
      return {
        hasHorizontalScroll: document.documentElement.scrollWidth > window.innerWidth,
        hasVerticalScroll: document.documentElement.scrollHeight > window.innerHeight,
      };
    });
    expect(dimensions.hasHorizontalScroll).toBe(false);
    expect(dimensions.hasVerticalScroll).toBe(false);

    // 5. Test dynamic switching back and forth via header buttons
    await page.click("#view-toggle-standard");
    await expect(page.locator("#panel-search-interest")).toBeVisible();
    await expect(page.locator("#panel-official-users")).toBeVisible();

    await page.click("#view-toggle-top50");
    await expect(page.locator("#panel-search-interest")).toHaveCount(0);
    await expect(page.locator("#panel-top50-fullscreen")).toBeVisible();

    // 6. Verify real-time download numbers dynamically increment on screen
    const totalTodaySelector = "#panel-top50-fullscreen strong.tabular-nums";
    const initialTotalStr = await page.locator(totalTodaySelector).innerText();
    const initialTotal = parseInt(initialTotalStr.replace(/,/g, ""), 10);
    expect(initialTotal).toBeGreaterThan(0);

    // Wait 1.5s for real-time velocity ticker to increment
    await page.waitForTimeout(1500);

    const updatedTotalStr = await page.locator(totalTodaySelector).innerText();
    const updatedTotal = parseInt(updatedTotalStr.replace(/,/g, ""), 10);
    expect(updatedTotal).toBeGreaterThan(initialTotal);
  });
});
