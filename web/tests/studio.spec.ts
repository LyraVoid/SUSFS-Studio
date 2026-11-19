import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("six pages, diagnostic dialog and capability labels", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("已激活");
  const status = page.getByRole("button", { name: /状态/ });
  await status.click();
  await expect(page.getByRole("dialog")).toContainText("能力来自演示夹具");
  await page.keyboard.press("Escape");
  await expect(status).toBeFocused();
  const menu = page.getByRole("navigation", { name: "主导航" });
  await menu.getByRole("link", { name: "规则" }).click();
  await expect(page.getByRole("heading", { name: "路径" })).toBeVisible();
  await page.getByRole("link", { name: "伪装" }).click();
  await expect(page.getByRole("heading", { name: "伪装" })).toBeVisible();
  await page.getByRole("link", { name: "重定向" }).click();
  await expect(page.getByRole("heading", { name: "重定向" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "伪装" })).toBeVisible();
  await menu.getByRole("link", { name: "扩展" }).click();
  await expect(page.getByRole("heading", { name: "扩展" })).toBeVisible();
  await menu.getByRole("link", { name: "设置" }).click();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
});

test("distinct demo results and confirmed implementation badges", async ({
  page,
}) => {
  await page.goto("/");
  const status = page.getByRole("status");
  await expect(status).toContainText("2.3.0");
  await expect(status).toContainText("LKM");
  for (const [scenario, label, badge] of [
    ["builtin24", "已激活", "Built-In"],
    ["unknownImplementation", "已激活", ""],
    ["loading", "读取中", ""],
    ["missing", "未检测到", ""],
    ["unknownProtocol", "协议未知", ""],
    ["failed", "连接失败", ""],
  ] as const) {
    await page.getByRole("link", { name: "设置" }).click();
    await page.getByLabel("演示场景").selectOption(scenario);
    await page.getByRole("link", { name: "首页" }).click();
    await expect(status).toContainText(label);
    if (badge) {
      await expect(status).toContainText(badge);
      await expect(status).toContainText("2.4.0");
    } else await expect(status).not.toContainText(/Built-In|LKM/);
  }
});

test("archive preview stays local and retains no draft on close", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await expect(page.getByRole("button", { name: "设备保存" })).toBeDisabled();
  const preview = page.getByRole("button", { name: "离线预览" });
  await preview.click();
  await page.locator("input[type=file]").setInputFiles({
    name: "sample.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schema": 2}'),
  });
  await expect(page.getByRole("dialog").locator("pre")).toHaveText(
    '{"schema": 2}',
  );
  await page.keyboard.press("Escape");
  await expect(preview).toBeFocused();
  await preview.click();
  await expect(page.getByRole("dialog").locator("pre")).toHaveCount(0);
});

test("mobile and desktop breakpoint, persisted preferences and axe", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:5177"))
      external.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("LKM");
  const nav = page.getByRole("navigation", { name: "主导航" });
  expect((await nav.boundingBox())?.width).toBe(360);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 840, height: 805 });
  expect((await nav.boundingBox())?.width).toBe(192);
  await nav.getByRole("link", { name: "设置" }).click();
  const darkSurface = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor);
  await page.getByLabel("主题").selectOption("light");
  await page.getByLabel("语言").selectOption("en");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    "light",
  );
  await expect(page.locator("body")).not.toHaveCSS(
    "background-color",
    darkSurface,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(external).toEqual([]);
});
