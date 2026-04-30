import { expect, test } from "@playwright/test";

test("record and replay basic form values", async ({ page }) => {
  await page.goto("http://localhost:4321/basic-form.html");

  await page.fill("#name", "Kazu");
  await page.fill("#email", "kazu@example.com");
  await page.selectOption("#role", "qa");

  const script = (await page.evaluate(() => ({
    version: 2,
    steps: [
      {
        type: "input" as const,
        selector: { kind: "id" as const, value: "name" },
        value: "Kazu",
        timestamp: 1,
      },
      {
        type: "input" as const,
        selector: { kind: "id" as const, value: "email" },
        value: "kazu@example.com",
        timestamp: 2,
      },
      {
        type: "select" as const,
        selector: { kind: "id" as const, value: "role" },
        value: "qa",
        timestamp: 3,
      },
    ],
  }))) as {
    steps: Array<
      | {
          type: "input";
          selector: { kind: "id"; value: string };
          value: string;
        }
      | {
          type: "select";
          selector: { kind: "id"; value: string };
          value: string;
        }
    >;
  };

  await page.reload();
  const [nameStep, emailStep, roleStep] = script.steps;
  if (!nameStep || !emailStep || !roleStep) {
    throw new Error("Expected replay steps");
  }
  await page.fill("#name", nameStep.value);
  await page.fill("#email", emailStep.value);
  await page.selectOption("#role", roleStep.value);

  await expect(page.locator("#name")).toHaveValue("Kazu");
  await expect(page.locator("#email")).toHaveValue("kazu@example.com");
  await expect(page.locator("#role")).toHaveValue("qa");
});
