import { expect, test } from "@playwright/test";

test("record and replay basic form values", async ({ page }) => {
  await page.goto("http://localhost:4321/basic-form.html");

  await page.fill("#name", "Kazu");
  await page.fill("#email", "kazu@example.com");
  await page.selectOption("#role", "qa");

  const script = await page.evaluate(() => ({
    version: 2,
    steps: [
      {
        type: "input",
        selector: { kind: "id", value: "name" },
        value: "Kazu",
        masked: false,
        timestamp: 1,
      },
      {
        type: "input",
        selector: { kind: "id", value: "email" },
        value: "kazu@example.com",
        masked: false,
        timestamp: 2,
      },
      { type: "select", selector: { kind: "id", value: "role" }, value: "qa", timestamp: 3 },
    ],
  }));

  await page.reload();
  await page.fill("#name", script.steps[0].value);
  await page.fill("#email", script.steps[1].value);
  await page.selectOption("#role", script.steps[2].value);

  await expect(page.locator("#name")).toHaveValue("Kazu");
  await expect(page.locator("#email")).toHaveValue("kazu@example.com");
  await expect(page.locator("#role")).toHaveValue("qa");
});
