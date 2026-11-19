import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("built WebUI denies embedded frames", async ({ page }) => {
  const html = await readFile(resolve("dist/index.html"), "utf8");
  expect(html).toContain("frame-src &#39;none&#39;");
  await page.route("http://studio.test/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === "/index.html") {
      await route.fulfill({ contentType: "text/html", body: html });
    } else {
      const path = resolve("dist", `.${pathname}`);
      await route.fulfill({
        path,
        contentType: pathname.endsWith(".css") ? "text/css" : "text/javascript",
      });
    }
  });
  await page.goto("http://studio.test/index.html");
  await expect(page.getByRole("status")).toContainText("已激活");
  const blocked = await page.evaluate(async () => {
    const event = new Promise<string>((resolve) => {
      document.addEventListener(
        "securitypolicyviolation",
        (violation) => resolve(violation.violatedDirective),
        { once: true },
      );
    });
    const frame = document.createElement("iframe");
    frame.src = "/index.html";
    document.body.append(frame);
    return event;
  });
  expect(blocked).toBe("frame-src");
  const frame = page.locator("iframe").contentFrame();
  await expect(frame.getByText("SUSFS Studio")).toHaveCount(0);
});
