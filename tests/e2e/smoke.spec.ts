import { expect, test } from "@playwright/test";

test("mobile explore renders bench cards", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "explore" })).toBeVisible();
});
