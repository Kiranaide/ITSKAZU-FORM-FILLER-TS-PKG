import { expect, test } from "@playwright/test";

test("replay writes value in open shadow root", async ({ page }) => {
  await page.goto("http://localhost:4321/basic-form.html");

  await page.evaluate(() => {
    const host = document.createElement("div");
    host.id = "host";
    const shadow = host.attachShadow({ mode: "open" });
    const input = document.createElement("input");
    input.id = "shadow-email";
    shadow.append(input);
    document.body.append(host);
  });

  await page.evaluate(() => {
    const host = document.querySelector("#host");
    const input = host?.shadowRoot?.querySelector<HTMLInputElement>("#shadow-email");
    if (input) {
      input.value = "shadow@example.com";
    }
  });

  const value = await page.evaluate(() => {
    const host = document.querySelector("#host");
    return host?.shadowRoot?.querySelector<HTMLInputElement>("#shadow-email")?.value ?? "";
  });

  expect(value).toBe("shadow@example.com");
});
