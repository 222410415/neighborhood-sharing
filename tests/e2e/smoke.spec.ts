import { test, expect } from "@playwright/test";

/**
 * E2e smoke tests: verify the primary user journeys against the running stack
 * (real Firebase project, seeded demo data). Command: docs/development.md.
 */

test.describe("Visitor browse", () => {
  test("Explore page shows real item cards", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Neighborhood/);
    const itemLinks = page.locator("a[href*='/items/']");
    await expect(itemLinks.first()).toBeVisible({ timeout: 15000 });
  });

  test("Item details page shows real listing", async ({ page }) => {
    await page.goto("/");
    await page.locator("a[href*='/items/']").first().click();
    await expect(page.locator("h1")).toBeVisible({ timeout: 15000 });
    // Should show the booking panel and the owner.
    await expect(page.getByRole("complementary", { name: "Book this item" })).toBeVisible();
    await expect(page.getByText("Shared by your neighbor")).toBeVisible();
  });

  test("Draft/paused items return not-found", async ({ page }) => {
    await page.goto("/items/itm_window-cleaner");
    await expect(page.getByText("This item isn’t available")).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe("Auth flow", () => {
  test("Sign in page renders with form fields", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.locator("h1")).toContainText("Welcome back.");
    await expect(page.locator('label:has-text("Email")')).toBeVisible();
    await expect(page.locator('label:has-text("Password")')).toBeVisible();
  });

  test("Sign up page renders with form fields", async ({ page }) => {
    await page.goto("/sign-up");
    await expect(page.locator("h1")).toContainText("Join your neighborhood.");
    await expect(page.locator('label:has-text("Name")')).toBeVisible();
    await expect(page.locator('label:has-text("Email")')).toBeVisible();
  });

  test("Forgot password page renders", async ({ page }) => {
    await page.goto("/forgot-password");
    await expect(page.locator("h1")).toContainText("Reset your password");
  });
});

test.describe("Keyboard accessibility", () => {
  test("Explore page is keyboard navigable", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus-visible")).toHaveCount(1);
  });

  test("Sign in form accepts keyboard input", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel("Email").focus();
    await page.keyboard.type("test@example.com");
    await expect(page.getByLabel("Email")).toHaveValue("test@example.com");
    // The visible label is "Password *" and the show/hide button is also labelled
    // with "password", so target the field by its label pattern.
    const password = page.getByLabel(/^Password/);
    await password.focus();
    await page.keyboard.type("password");
    await expect(password).toHaveValue("password");
  });
});

/**
 * Sprint 2: signed-in exchange pages (the browser signs in against Firebase Auth).
 */
const DEMO_PASSWORD = process.env.SEED_USER_PASSWORD ?? "DemoPass123!";

async function signIn(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), { timeout: 20000 });
}

test.describe("Signed-in exchange pages", () => {
  test("Item page shows the booking panel to a signed-in member", async ({ page }) => {
    await signIn(page, "hanadi@neighborhood-demo.test");
    // Leen's laser level: never Hanadi's own item, so the borrower panel shows.
    await page.goto("/items/itm_laser-level");
    const panel = page.getByRole("complementary", { name: "Book this item" });
    await expect(panel).toBeVisible({ timeout: 20000 });
    await expect(panel.getByRole("button", { name: /Ask the owner/ })).toBeVisible();
    await expect(page.getByText("Booking requests aren’t available yet")).toHaveCount(0);
  });

  test("Picking days on the calendar shows the server quote, labelled simulated", async ({ page }) => {
    await signIn(page, "hanadi@neighborhood-demo.test");
    await page.goto("/items/itm_laser-level");
    const panel = page.getByRole("complementary", { name: "Book this item" });
    await panel.getByRole("button", { name: "Next month" }).click({ timeout: 20000 });
    const days = panel.locator(".calendar-day:not([disabled])");
    await days.nth(10).click();
    await days.nth(12).click();
    await expect(panel.getByText("Refundable deposit")).toBeVisible({ timeout: 15000 });
    await expect(panel.getByText("Simulated", { exact: false }).first()).toBeVisible();
    await expect(panel.getByRole("button", { name: /Request to book|Book now/ })).toBeEnabled();
  });

  test("Dates from the search carry over to the item page", async ({ page }) => {
    await page.goto("/?from=2026-12-14&to=2026-12-16");
    await expect(page.getByRole("heading", { name: "Free on your dates" })).toBeVisible({ timeout: 20000 });
    const first = page.locator(".item-card-link").first();
    await expect(first).toHaveAttribute("href", /from=2026-12-14&to=2026-12-16/);
  });

  test("Activity brings requests, messages and updates together", async ({ page }) => {
    await signIn(page, "leen@neighborhood-demo.test");
    await page.goto("/activity");
    await expect(page.locator("h1")).toContainText("Activity", { timeout: 20000 });
    await expect(page.getByRole("link", { name: /Activity/ }).first()).toBeVisible();
  });

  test("Phones use the tab bar and the booking bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(page, "hanadi@neighborhood-demo.test");
    await page.goto("/");
    const tabs = page.getByRole("navigation", { name: "Mobile navigation" });
    await expect(tabs).toBeVisible({ timeout: 20000 });
    await expect(tabs.getByRole("link", { name: /Explore/ })).toBeVisible();
    await expect(tabs.getByRole("link", { name: /Profile/ })).toBeVisible();
    await page.goto("/items/itm_laser-level");
    await expect(page.locator(".book-bar").getByRole("button", { name: "Choose dates" })).toBeVisible({ timeout: 20000 });
    await expect(tabs).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test("Bookings page renders with Borrowing and Lending views", async ({ page }) => {
    await signIn(page, "hanadi@neighborhood-demo.test");
    await page.goto("/bookings");
    await expect(page.locator("h1")).toContainText("Bookings", { timeout: 20000 });
    await expect(page.getByRole("tab", { name: "Borrowing" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Lending" })).toBeVisible();
  });

  test("Messages page renders", async ({ page }) => {
    await signIn(page, "leen@neighborhood-demo.test");
    await page.goto("/messages");
    await expect(page.locator("h1")).toContainText("Messages", { timeout: 20000 });
  });
});

/**
 * Sprint 3: trust, community and AI pages. Needs the Sprint 3 seed (policies)
 * and the reviewer role for Jawharah (scripts/admin/grant-role.mjs).
 */
test.describe("Sprint 3 pages", () => {
  test("Review workspace refuses a member and loads for the reviewer", async ({ page }) => {
    await signIn(page, "hanadi@neighborhood-demo.test");
    await page.goto("/admin");
    await expect(page.getByText("Reviewers only")).toBeVisible({ timeout: 20000 });
    // Signing in again replaces the current member.
    await signIn(page, "jawharah@neighborhood-demo.test");
    await page.goto("/admin");
    await expect(page.locator("h1")).toContainText("Review workspace", { timeout: 20000 });
  });

  test("Saved items page renders", async ({ page }) => {
    await signIn(page, "hanadi@neighborhood-demo.test");
    await page.goto("/favorites");
    await expect(page.locator("h1")).toContainText("Saved items", { timeout: 20000 });
  });

  test("Community requests list and request form render", async ({ page }) => {
    await page.goto("/requests");
    await expect(page.locator("h1")).toContainText("Community requests", { timeout: 20000 });
    const firstRequest = page.locator("a[href^='/requests/req_']").first();
    if ((await firstRequest.count()) > 0) {
      await firstRequest.click();
      await expect(page.getByRole("heading", { name: "Offers" })).toBeVisible({ timeout: 20000 });
    }
    await signIn(page, "hanadi@neighborhood-demo.test");
    await page.goto("/requests/new");
    await expect(page.locator("h1")).toContainText("Ask for an item", { timeout: 20000 });
  });

  test("Policy page shows the text, status label and assistant panel", async ({ page }) => {
    await page.goto("/policies");
    await expect(page.locator("h1")).toContainText("Policies", { timeout: 20000 });
    await page.goto("/policies/pol_deposit");
    await expect(page.locator("h1")).toContainText("Refundable deposits", { timeout: 20000 });
    await expect(page.getByText(/Version .+ · (Approved|Demonstration draft)/)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Ask about policies/ })).toBeVisible();
  });

  test("Item page shows related items", async ({ page }) => {
    await page.goto("/items/itm_cordless-drill");
    await expect(page.getByRole("heading", { name: /You might also need|Similar items/ })).toBeVisible({ timeout: 20000 });
  });
});

test.describe("Create listing", () => {
  test("Create page takes photos and asks for one before publishing", async ({ page }) => {
    await signIn(page, "hanadi@neighborhood-demo.test");
    await page.goto("/listings/new");
    await expect(page.getByRole("heading", { name: "Photos" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole("button", { name: "Upload image" })).toBeVisible();
    await page.getByLabel(/^Title/).fill("Photo Rule Check");
    await page.getByLabel(/^Description/).fill("Never saved: publishing stops before any request.");
    await page.locator('select[name="categoryId"]').selectOption({ index: 1 });
    await page.locator('select[name="condition"]').selectOption({ index: 1 });
    await page.getByLabel("Free lending").check();
    const hood = page.locator('select[name="neighborhoodId"]');
    if (!(await hood.inputValue())) await hood.selectOption({ index: 1 });
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByText("Add at least one photo to publish")).toBeVisible();
    await expect(page).toHaveURL(/\/listings\/new$/);
  });
});
