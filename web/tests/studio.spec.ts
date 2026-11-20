import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import fixtures from "../../contracts/diagnostic-v1.json" with { type: "json" };

const materialColor = (page: Page, role: string) =>
  page.locator("html").evaluate((root, name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(--md-sys-color-${name})`;
    root.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, role);

test("a late host response cannot overwrite a newer refresh", async ({
  page,
}) => {
  await page.addInitScript(
    ({ hello, active, failed }) => {
      let delayNext = false;
      let failNext = false;
      window.addEventListener("delay-next-status", () => {
        delayNext = true;
      });
      window.addEventListener("fail-next-status", () => {
        failNext = true;
      });
      window.studioDiagnostics = {
        hello: () => JSON.stringify(hello),
        status: () => {
          if (delayNext) {
            delayNext = false;
            return new Promise<string>((resolve) => {
              window.addEventListener(
                "release-old-status",
                () => resolve(JSON.stringify(active)),
                { once: true },
              );
            });
          }
          if (failNext) {
            failNext = false;
            return JSON.stringify(failed);
          }
          return JSON.stringify(active);
        },
      };
    },
    { hello: fixtures.hello, active: fixtures.active, failed: fixtures.failed },
  );
  await page.goto("/");
  await expect(page.getByRole("button", { name: /状态/ })).toHaveCSS(
    "border-radius",
    "16px",
  );
  await expect(page.getByRole("status")).toContainText("v2.3.0");
  await page.getByRole("button", { name: /状态/ }).click();
  const refresh = page
    .getByRole("dialog")
    .getByRole("button", { name: "刷新诊断" });
  await page.evaluate(() =>
    window.dispatchEvent(new Event("delay-next-status")),
  );
  await refresh.click();
  await expect(page.getByRole("dialog")).toContainText("正在刷新");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("fail-next-status")),
  );
  await refresh.click();
  await expect(page.getByRole("dialog")).toContainText("无法读取诊断结果");
  await page.evaluate(() =>
    window.dispatchEvent(new Event("release-old-status")),
  );
  await expect(page.getByRole("dialog")).toContainText("无法读取诊断结果");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status")).not.toContainText("LKM");
});

test("a host without a command bridge does not display demo data", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.ksu = {};
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("连接失败");
  await expect(page.getByRole("status")).not.toContainText("LKM");
  await expect(page.getByText("宿主未提供安全诊断接口")).toBeVisible();
  await expect(page.getByText("演示数据", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await expect(page.getByLabel("演示场景")).toHaveCount(0);
});

test("a command host executes only fixed diagnostic calls", async ({
  page,
}) => {
  await page.addInitScript(
    ({ hello, active }) => {
      window.ksu = {
        exec: (command: string, options: string, callback: string) => {
          if (options !== "{}") throw new Error("invalid options");
          const response = command.endsWith(" hello")
            ? hello
            : command.endsWith(" status")
              ? active
              : undefined;
          if (!response) throw new Error("unexpected command");
          (
            window as unknown as Record<
              string,
              (code: number, output: string) => void
            >
          )[callback]?.(0, JSON.stringify(response));
        },
      };
    },
    { hello: fixtures.hello, active: fixtures.active },
  );
  await page.goto("/");
  await expect(page.getByText("宿主诊断", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("v2.3.0");
  await expect(page.getByRole("status")).toContainText("LKM");
});

test("an injected host shows its own result and refresh failures", async ({
  page,
}) => {
  await page.addInitScript(
    ({ hello, active, failed }) => {
      let result = active;
      window.studioDiagnostics = {
        hello: () => JSON.stringify(hello),
        status: () => JSON.stringify(result),
      };
      window.addEventListener("message", (event) => {
        if (
          event.source === window &&
          event.data === "test-diagnostic-failure"
        ) {
          result = failed;
        }
      });
    },
    {
      hello: fixtures.hello,
      active: fixtures.active as unknown,
      failed: fixtures.failed as unknown,
    },
  );
  await page.goto("/");
  await expect(page.getByText("宿主诊断", { exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("v2.3.0");
  await expect(page.getByText("演示数据", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: /状态/ }).click();
  await expect(page.getByRole("dialog")).toContainText("接口报告可用");
  await page.evaluate(() =>
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window,
        data: "test-diagnostic-failure",
      }),
    ),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "刷新诊断" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("无法读取诊断结果");
  await expect(page.getByRole("dialog")).not.toContainText("接口报告可用");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("status")).not.toContainText("LKM");
});

test("three-item main navigation and six SUSFS tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("已激活");
  await expect(page.locator("main h2").allTextContents()).resolves.toEqual([
    "设备",
  ]);
  await expect(page.locator("main [data-availability]")).toHaveCount(0);
  const status = page.getByRole("button", { name: /状态/ });
  await status.click();
  await expect(page.getByRole("dialog")).toContainText("能力来自演示夹具");
  await expect(page.getByRole("dialog")).not.toContainText(/管理者|交接/);
  await page.keyboard.press("Escape");
  await expect(status).toBeFocused();
  const menu = page.getByRole("navigation", { name: "主导航" });
  await expect(menu.getByRole("link")).toHaveCount(3);
  await menu.getByRole("link", { name: "规则" }).click();
  await expect(
    page.getByRole("heading", { name: "SUSFS", level: 1 }),
  ).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "规则分类" });
  await expect(tabs.getByRole("link")).toHaveText([
    "概览",
    "基础设置",
    "路径隐藏",
    "文件伪装",
    "重定向",
    "扩展",
  ]);
  await expect(page.locator("main [data-availability]")).toHaveCount(14);
  await tabs.getByRole("link", { name: "路径隐藏" }).click();
  await expect(page.getByRole("heading", { name: "路径规则" })).toBeVisible();
  await tabs.getByRole("link", { name: "文件伪装" }).click();
  await expect(page.getByRole("heading", { name: "Map 规则" })).toBeVisible();
  await tabs.getByRole("link", { name: "重定向" }).click();
  await expect(page.getByRole("heading", { name: "重定向规则" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Map 规则" })).toBeVisible();
  await tabs.getByRole("link", { name: "扩展" }).click();
  await expect(
    page.getByRole("button", { name: "添加：隐藏模块名" }),
  ).toBeDisabled();
  await menu.getByRole("link", { name: "设置" }).click();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
});

test("touch feedback, keyboard focus and safe diagnostic dialog", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 360, height: 600 },
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--safe-area-inset-top", "40px");
    document.documentElement.style.setProperty(
      "--safe-area-inset-bottom",
      "24px",
    );
  });
  for (const label of ["型号", "系统", "内核"]) {
    const button = page.getByRole("button", { name: new RegExp(label) });
    await expect(button).toBeVisible();
    await button.tap();
    await expect(button).toHaveCSS(
      "background-color",
      await materialColor(page, "surface-bright"),
    );
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByRole("button", { name: /状态/ }).tap();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  if (!bounds) throw new Error("Missing dialog bounds");
  expect(bounds.y).toBeGreaterThanOrEqual(56);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(560);
  expect(bounds.height).toBeLessThanOrEqual(480);
  const body = dialog.locator('[class*="_body_"]');
  expect(
    await body.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(dialog.getByText("挂载路径前缀")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "设置" })
    .tap();
  const select = page.getByRole("combobox", { name: "主题" });
  const automatic = page.getByRole("switch", { name: "自动采集" });
  await expect(automatic).toBeDisabled();
  await expect(automatic).not.toBeChecked();
  await expect(
    page.getByText("等待 Android 宿主和启动阶段验证。", { exact: true }),
  ).toBeVisible();
  await expect(automatic.locator("+ span")).toHaveCSS("width", "52px");
  await expect(automatic.locator("+ span")).toHaveCSS("height", "32px");
  await expect(automatic.locator("+ span > span")).toHaveCSS("width", "24px");
  await select.tap();
  const choice = select.locator("..");
  await expect(choice).toHaveCSS("outline-style", "none");
  await expect(choice.locator('[data-testid="settings-row"]')).toHaveCSS(
    "background-color",
    await materialColor(page, "surface-bright"),
  );
  await select.blur();
  await page.keyboard.press("Tab");
  await select.focus();
  await expect(choice).toHaveCSS("outline-style", "solid");
  await context.close();
});

test("Rules tabs keep the selected category visible", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 805 });
  await page.goto("/#/rules/extensions");
  const tabs = page.getByTestId("rules-tabs");
  const visible = async () => {
    const bounds = await tabs.boundingBox();
    const active = await tabs.locator('a[aria-current="page"]').boundingBox();
    if (!bounds || !active) throw new Error("Missing tab bounds");
    expect(active.x).toBeGreaterThanOrEqual(bounds.x - 1);
    expect(active.x + active.width).toBeLessThanOrEqual(
      bounds.x + bounds.width + 1,
    );
  };
  await visible();
  expect(await tabs.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    0,
  );
  const back = tabs.getByRole("link", { name: "概览" });
  await back.focus();
  await page.keyboard.press("Enter");
  await expect(tabs.getByRole("link", { name: "概览" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await visible();
  await expect
    .poll(() => tabs.evaluate((element) => element.scrollLeft))
    .toBe(0);
  await page.goto("/#/rules/redirect");
  await visible();
  await page.goBack();
  await visible();
});

test("Rules page keeps its layout tokens", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 805 });
  await page.addInitScript(() => localStorage.setItem("studio-theme", "dark"));
  await page.goto("/#/rules/overview");
  await expect(page.locator("html")).toHaveAttribute(
    "data-mantine-color-scheme",
    "dark",
  );
  const rules = page.getByTestId("rules-page");
  const content = page.getByTestId("rules-content");
  const tabs = page.getByTestId("rules-tabs");
  const header = page.getByTestId("rules-header");
  const toolbar = page.getByTestId("rules-toolbar");
  const refresh = page.getByRole("button", { name: "刷新", exact: true });
  const title = header.getByRole("heading", { name: "SUSFS", level: 1 });
  const active = tabs.locator('a[aria-current="page"]');
  const inactive = tabs.getByRole("link", { name: "基础设置" });
  const list = page.getByTestId("segmented-list").first();
  const rows = list.getByTestId("settings-row");
  const first = rows.first();
  const second = rows.nth(1);
  const sectionTitle = page.getByTestId("segmented-section-title").first();
  const style = (locator: Locator, property: string) =>
    locator.evaluate(
      (element, key) => getComputedStyle(element).getPropertyValue(key),
      property,
    );
  await expect(page.locator("main h2").allTextContents()).resolves.toEqual([
    "控制协议兼容",
    "设备归档状态",
    "保存草稿",
    "设备应用",
    "配置",
    "能力与兼容性",
  ]);
  await expect(rules).toHaveCSS("max-width", "840px");
  await expect(header.getByRole("link")).toHaveCount(0);
  const toolbarBox = await toolbar.boundingBox();
  const refreshBox = await refresh.boundingBox();
  if (!toolbarBox || !refreshBox)
    throw new Error("Missing rules header bounds");
  expect(refreshBox.x + refreshBox.width).toBeCloseTo(
    toolbarBox.x + toolbarBox.width,
    0,
  );
  expect(await style(header, "height")).toBe("120px");
  expect(await style(title, "font-size")).toBe("36px");
  expect(await style(title, "line-height")).toBe("44px");
  expect(await style(content.locator(":scope > div"), "gap")).toBe("20px");
  expect(await style(tabs, "gap")).toBe("6px");
  expect(await style(tabs, "flex-wrap")).toBe("nowrap");
  expect(await style(tabs, "overflow-x")).toBe("auto");
  expect(await style(inactive, "min-height")).toBe("48px");
  expect(await style(inactive, "padding-left")).toBe("20px");
  expect(await style(inactive, "border-radius")).toBe("999px");
  expect(await style(inactive, "background-color")).toBe(
    await materialColor(page, "surface-bright"),
  );
  expect(await style(active, "background-color")).toBe(
    await materialColor(page, "secondary-container"),
  );
  expect(await style(list, "gap")).toBe("2px");
  expect(await style(first, "border-radius")).toBe("16px 16px 4px 4px");
  expect(await style(second, "border-radius")).toBe("4px 4px 16px 16px");
  expect(await style(first, "font-size")).toBe("17px");
  expect(await style(first, "line-height")).toBe("22px");
  const detail = first.getByTestId("settings-row-detail");
  expect(await style(detail, "font-size")).toBe("15px");
  expect(await style(detail, "line-height")).toBe("20px");
  expect(await style(sectionTitle, "font-size")).toBe("14px");
  expect(await style(sectionTitle, "line-height")).toBe("20px");
  expect(await style(sectionTitle, "color")).toBe(
    await materialColor(page, "primary"),
  );
  expect(await style(sectionTitle, "padding-left")).toBe("16px");
  expect(await style(sectionTitle, "margin-bottom")).toBe("8px");
  expect(await style(page.getByTestId("shell"), "background-color")).toBe(
    await materialColor(page, "surface-container"),
  );
  await page.setViewportSize({ width: 1200, height: 805 });
  expect((await rules.boundingBox())?.width).toBe(840);

  await page.getByTestId("rules-content").evaluate((element) => {
    element.scrollTop = 120;
  });
  await expect.poll(() => style(header, "height")).toBe("64px");
  expect(await style(title, "font-size")).toBe("22px");
  expect(await style(title, "line-height")).toBe("28px");
});

test("Rules tabs keep one content width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 805 });
  const routes = [
    "overview",
    "basic",
    "paths",
    "disguise",
    "redirect",
    "extensions",
  ];
  let baseline: { x: number; width: number } | undefined;
  for (const route of routes) {
    await page.goto(`/#/rules/${route}`);
    const section = await page
      .getByTestId("segmented-section-title")
      .first()
      .boundingBox();
    const box = await page.getByTestId("segmented-list").first().boundingBox();
    if (!section || !box)
      throw new Error(`Missing content bounds for ${route}`);
    expect(section.height).toBeCloseTo(20, 0);
    expect(box.y - section.y).toBeLessThan(60);
    const next = { x: box.x, width: box.width };
    if (!baseline) baseline = next;
    expect(next.x).toBeCloseTo(baseline.x, 0);
    expect(next.width).toBeCloseTo(baseline.width, 0);
  }
});

test("asks the host for edge-to-edge layout", async ({ page }) => {
  await page.addInitScript(() => {
    window.ksu = {
      enableEdgeToEdge: (enabled?: boolean) => {
        document.documentElement.dataset.edgeToEdge = String(enabled === true);
      },
    };
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute(
    "data-edge-to-edge",
    "true",
  );
});

test("flexible app bar stays stable between expanded and collapsed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 805 });
  await page.goto("/#/rules/overview");
  const content = page.getByTestId("rules-content");
  const header = page.getByTestId("rules-header");
  await content.evaluate((element) => {
    element.scrollTop = 28;
  });
  await expect
    .poll(() => header.evaluate((element) => getComputedStyle(element).height))
    .not.toBe("120px");
  const height = await header.evaluate(
    (element) => getComputedStyle(element).height,
  );
  const scrollTop = await content.evaluate((element) => element.scrollTop);
  await page.waitForTimeout(300);
  await expect(
    header.evaluate((element) => getComputedStyle(element).height),
  ).resolves.toBe(height);
  await expect(content.evaluate((element) => element.scrollTop)).resolves.toBe(
    scrollTop,
  );
});

test("Rules header collapse does not resize its scrolling viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 805 });
  await page.goto("/#/rules/disguise");
  const content = page.getByTestId("rules-content");
  const header = page.getByTestId("rules-header");
  const measure = () =>
    content.evaluate((element) => ({
      height: element.clientHeight,
      range: element.scrollHeight - element.clientHeight,
    }));
  await expect(page.getByRole("heading", { name: "Map 规则" })).toBeVisible();
  const initial = await measure();
  for (const scrollTop of [10, 28, 45, 56, 28, 0]) {
    await content.evaluate((element, value) => {
      element.scrollTop = value;
    }, scrollTop);
    await expect
      .poll(() => content.evaluate((element) => element.scrollTop))
      .toBe(scrollTop);
    await expect
      .poll(() =>
        header.evaluate((element) =>
          parseFloat(getComputedStyle(element).height),
        ),
      )
      .toBe(120 - scrollTop);
    expect(await measure()).toEqual(initial);
  }
});

test("Home and Settings keep their large app bars pinned while scrolling", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    document.documentElement.style.setProperty("--safe-area-inset-top", "24px"),
  );
  const main = page.getByRole("main");
  const header = page.getByTestId("flexible-page-header");
  const title = header.getByRole("heading", { level: 1 });
  const nav = page.getByRole("navigation", { name: "主导航" });
  const top = () =>
    header.evaluate((element) => element.getBoundingClientRect().top);
  await expect(title).toHaveText("SUSFS Studio");
  await expect(header).toHaveCSS("height", "144px");
  await expect(title).toHaveCSS("font-size", "36px");
  const card = page.locator('output[data-state="active"]');
  await expect(card).toBeVisible();
  const headerBox = await header.boundingBox();
  const cardBox = await card.boundingBox();
  if (!headerBox || !cardBox) throw new Error("Missing home layout bounds");
  expect(cardBox.y).toBeCloseTo(headerBox.y + headerBox.height, 0);
  await main.hover({ position: { x: 120, y: 240 } });
  await page.mouse.wheel(0, 28);
  await expect(header).toHaveCSS("height", "116px");
  await expect(title).toHaveCSS("font-size", "29px");
  expect(await top()).toBe(0);
  await page.mouse.wheel(0, 80);
  await expect(header).toHaveCSS("height", "88px");
  await expect(title).toHaveCSS("font-size", "22px");
  expect(await top()).toBe(0);
  await nav.getByRole("link", { name: "设置" }).click();
  await expect(title).toHaveText("设置");
  await expect(header).toHaveCSS("height", "144px");
  await main.evaluate((element) => {
    element.scrollTop = 400;
  });
  await expect(header).toHaveCSS("height", "88px");
  expect(await top()).toBe(0);
  await nav.getByRole("link", { name: "首页" }).click();
  await expect(title).toHaveText("SUSFS Studio");
  await expect(header).toHaveCSS("height", "88px");
  await main.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(header).toHaveCSS("height", "144px");
  await nav.getByRole("link", { name: "设置" }).click();
  await expect(header).toHaveCSS("height", "88px");
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
    await page.getByRole("link", { name: "设置", exact: true }).click();
    await page.getByLabel("演示场景").selectOption(scenario);
    await page.getByRole("link", { name: "首页" }).click();
    await expect(status).toContainText(label);
    if (badge) {
      await expect(status).toContainText(badge);
      await expect(status).toContainText("2.4.0");
    } else await expect(status).not.toContainText(/Built-In|LKM/);
    if (scenario === "loading" || scenario === "failed") {
      await page.getByRole("link", { name: "规则" }).click();
      const availability = scenario === "loading" ? "loading" : "unknown";
      await expect(
        page.locator(`main [data-availability="${availability}"]`),
      ).toHaveCount(14);
    }
  }
});

test("a non-LKM sample keeps extension edits blocked with a reason", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await page.getByLabel("演示场景").selectOption("builtin24");
  await page.getByRole("link", { name: "规则", exact: true }).click();
  await page
    .getByRole("navigation", { name: "规则分类" })
    .getByRole("link", {
      name: "扩展",
    })
    .click();
  await expect(
    page.getByText(
      "扩展编辑需要当前设备确认使用 LKM；演示和过期结果不会启用编辑。",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加：隐藏模块名" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "添加：挂载路径前缀" }),
  ).toBeDisabled();
});

test("archive preview stays local and retains no draft on close", async ({
  page,
}) => {
  await page.goto("/#/rules/overview");
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
  await expect(page.getByRole("dialog")).toContainText("声明的 Schema: 2");
  await page
    .locator("input[type=file]")
    .nth(1)
    .setInputFiles({
      name: "compare.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"schema":3,"extra":18446744073709551615}'),
    });
  await expect(page.getByRole("dialog")).toContainText("新增字段: /extra");
  await expect(page.getByRole("dialog")).toContainText("更改字段: /schema");
  await expect(page.getByRole("dialog").locator("pre").first()).toHaveText(
    '{"schema":3,"extra":18446744073709551615}',
  );
  await page.keyboard.press("Escape");
  await expect(preview).toBeFocused();
  await preview.click();
  await expect(page.getByRole("dialog").locator("pre")).toHaveCount(0);
});

test("archive save, receipt refresh and export form one confirmed loop", async ({
  page,
}) => {
  const archive = JSON.stringify({
    format: "susfs-studio",
    schema: 1,
    rules: {
      paths: [
        {
          id: "safe-test",
          path: "/data/local/tmp/studio-test",
          looping: false,
        },
      ],
      maps: [],
      kstats: [],
      redirects: [],
    },
    futureField: { retained: true },
  });
  await page.addInitScript(
    ({ hello, active, archive }) => {
      let saved = "";
      let upload = "";
      const revision = "a".repeat(64);
      const token = "0123456789abcdef0123456789abcdef";
      const receipt = {
        revision,
        savedAt: "1760000000000",
        bytes: archive.length,
      };
      const reply = (requestId: string, data: unknown) =>
        JSON.stringify({ protocol: 1, requestId, ok: true, data });
      window.ksu = {
        exec: (command: string, options: string, callback: string) => {
          if (options !== "{}") throw new Error("invalid options");
          let output: string | undefined;
          if (command.endsWith(" hello")) output = JSON.stringify(hello);
          else if (command.endsWith(" status")) output = JSON.stringify(active);
          else if (command.endsWith(" backups"))
            output = reply("backups", [
              {
                id: token,
                modifiedAt: 1760000000,
                bytes: archive.length,
                valid: true,
                revision,
              },
              {
                id: "0".repeat(32),
                modifiedAt: 1760000000,
                bytes: 7,
                valid: false,
              },
            ]);
          else if (command.endsWith(` backup ${token}`))
            output = reply("backup", {
              kind: "saved",
              text: archive,
              revision,
            });
          else if (command.endsWith(" stage"))
            output = reply("stage", {
              token,
              uploadPath: `/data/adb/susfs-studio/.staging/${token}.input`,
              baseline: saved || undefined,
              revision: saved ? revision : undefined,
            });
          else if (command.endsWith(` save ${token}`)) {
            saved = upload;
            output = reply("save", receipt);
          } else if (command.endsWith(` restore ${token}`)) {
            saved = upload;
            output = reply("restore", receipt);
          } else if (command.endsWith(" read")) {
            output = reply(
              "read",
              saved
                ? {
                    kind: "saved",
                    text: saved,
                    revision,
                    receipt,
                    receiptStatus: "available",
                  }
                : { kind: "empty", receiptStatus: "missing" },
            );
          }
          if (!output) throw new Error(`unexpected command: ${command}`);
          (
            window as unknown as Record<
              string,
              (code: number, stdout: string) => void
            >
          )[callback]?.(0, output);
        },
        io: () => ({
          version: () => 1,
          FileOutputStream: () => ({
            open: () => "stream",
            write: (_id: string, base64: string) => {
              upload = new TextDecoder().decode(
                Uint8Array.from(atob(base64), (char) => char.charCodeAt(0)),
              );
              return true;
            },
            close: () => true,
          }),
        }),
      };
    },
    { hello: fixtures.hello, active: fixtures.active, archive },
  );
  await page.goto("/#/rules/overview");
  const save = page.getByRole("button", { name: "设备保存" });
  await expect(save).toBeEnabled();
  await save.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("尚无 Studio 归档");
  await dialog
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "device-loop.json",
      mimeType: "application/json",
      buffer: Buffer.from(archive),
    });
  await expect(dialog).toContainText("新增字段: /format");
  await expect(dialog).toContainText("不调用 SUSFS 写操作");
  await dialog.getByRole("button", { name: "检查并确认保存" }).click();
  await expect(dialog).toContainText("确认保存到设备");
  await expect(dialog).toContainText("device-loop.json");
  await dialog.getByRole("button", { name: "刷新设备归档" }).click();
  await expect(
    dialog.getByRole("button", { name: "检查并确认保存" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "检查并确认保存" }).click();
  await dialog.getByRole("button", { name: "确认保存" }).click();
  await expect(dialog.getByRole("status")).toContainText("保存完成");
  await expect(dialog).toContainText("已保存 Studio 归档");
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "设备导出" }).click();
  await expect((await download).suggestedFilename()).toMatch(
    /^susfs-studio-aaaaaaaaaaaa\.json$/,
  );
  await page.keyboard.press("Escape");
  await save.click();
  await expect(page.getByRole("dialog")).toContainText("已保存 Studio 归档");
  await expect(page.getByRole("dialog")).toContainText(
    "回执：修订 aaaaaaaaaaaa",
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "恢复备份" }).click();
  const restore = page.getByRole("dialog");
  await expect(restore).toContainText("不改变内核运行状态");
  const backups = restore.getByLabel("设备自动备份");
  await expect(
    backups.getByRole("option", { name: /不可恢复/ }),
  ).toBeDisabled();
  await backups.selectOption("0123456789abcdef0123456789abcdef");
  await expect(restore).toContainText("设备自动备份 · 01234567");
  await restore.getByRole("button", { name: "检查并确认恢复" }).click();
  await page.waitForTimeout(300);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await restore.getByRole("button", { name: "确认恢复" }).click();
  await expect(restore.getByRole("status")).toContainText("恢复完成");
});

test("an uncertain archive save keeps the draft and requires verification", async ({
  page,
}) => {
  const archive = JSON.stringify({
    format: "susfs-studio",
    schema: 1,
    rules: { paths: [], maps: [], kstats: [], redirects: [] },
  });
  await page.addInitScript(
    ({ hello, active, archive }) => {
      const token = "fedcba9876543210fedcba9876543210";
      let committed = false;
      const reply = (requestId: string, data: unknown, ok = true) =>
        JSON.stringify({
          protocol: 1,
          requestId,
          ok,
          ...(ok ? { data } : { error: data }),
        });
      window.ksu = {
        exec: (command: string, _options: string, callback: string) => {
          if (command.endsWith(` save ${token}`)) committed = true;
          const output = command.endsWith(" hello")
            ? JSON.stringify(hello)
            : command.endsWith(" status")
              ? JSON.stringify(active)
              : command.endsWith(" stage")
                ? reply("stage", {
                    token,
                    uploadPath: `/data/adb/susfs-studio/.staging/${token}.input`,
                    baseline: null,
                    revision: null,
                  })
                : command.endsWith(` save ${token}`)
                  ? reply(
                      "save",
                      { code: "RESULT_UNKNOWN", retryable: false },
                      false,
                    )
                  : reply("read", {
                      kind: committed ? "saved" : "empty",
                      ...(committed
                        ? { text: archive, revision: "a".repeat(64) }
                        : {}),
                      receiptStatus: "missing",
                    });
          (
            window as unknown as Record<
              string,
              (code: number, stdout: string) => void
            >
          )[callback]?.(0, output);
        },
        io: () => ({
          version: () => 1,
          FileOutputStream: () => ({
            open: () => "stream",
            write: () => true,
            close: () => true,
          }),
        }),
      };
    },
    { hello: fixtures.hello, active: fixtures.active, archive },
  );
  await page.goto("/#/rules/overview");
  await page.getByRole("button", { name: "设备保存" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "uncertain.json",
      mimeType: "application/json",
      buffer: Buffer.from(archive),
    });
  await dialog.getByRole("button", { name: "检查并确认保存" }).click();
  await dialog.getByRole("button", { name: "确认保存" }).click();
  await expect(dialog).toContainText("保存结果未知");
  await expect(dialog).toContainText("uncertain.json");
  await expect(dialog.getByRole("button", { name: "确认保存" })).toBeDisabled();
  await dialog.getByRole("button", { name: "返回检查" }).click();
  await expect(
    dialog.getByRole("button", { name: "检查并确认保存" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "刷新设备归档" }).click();
  await expect(
    dialog.getByRole("button", { name: "检查并确认保存" }),
  ).toBeEnabled();
  await expect(dialog).toContainText("uncertain.json");
  await expect(dialog).toContainText("归档内容可读，但持久化回执缺失");
  await expect(dialog).toContainText("未发现差异");
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
  await page.setViewportSize({ width: 839, height: 805 });
  expect((await nav.boundingBox())?.width).toBe(839);
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

test("Material profiles update all pages and dialogs, persist, and reset independently", async ({
  page,
}) => {
  await page.goto("/#/settings");
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-mantine-color-scheme", "dark");
  const nav = page.getByRole("navigation", { name: "主导航" });
  const spec = page.getByRole("combobox", { name: "配色规范" });
  const scheme = page.getByRole("combobox", { name: "配色风格" });
  const contrast = page.getByRole("combobox", { name: "配色对比度" });
  const appearance = page.getByRole("combobox", { name: "主题" });
  const shell = page.getByTestId("shell");
  const originalPrimary = await materialColor(page, "primary");
  const originalSurface = await materialColor(page, "surface-container");
  const originalWidth = (await nav.boundingBox())?.width;
  const slate = page.getByRole("radio", { name: "蓝灰" });
  await expect(slate).toBeChecked();
  const swatches = page
    .getByRole("group", { name: "种子颜色" })
    .getByRole("radio");
  await expect(swatches).toHaveCount(7);
  expect(
    await swatches.evaluateAll(
      (inputs) =>
        new Set(inputs.map((input) => input.getBoundingClientRect().top)).size,
    ),
  ).toBe(1);
  await slate.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "海蓝" })).toBeChecked();
  await expect
    .poll(() => materialColor(page, "primary"))
    .not.toBe(originalPrimary);
  const seedSurface = await materialColor(page, "surface-container");

  await spec.focus();
  await page.keyboard.press("ArrowUp");
  await expect(spec).toHaveValue("2021");
  await expect
    .poll(() => materialColor(page, "surface-container"))
    .not.toBe(seedSurface);
  const oldSecondary = await materialColor(page, "secondary-container");
  await scheme.selectOption("vibrant");
  await expect
    .poll(() => materialColor(page, "secondary-container"))
    .not.toBe(oldSecondary);
  const standardPrimary = await materialColor(page, "primary");
  await contrast.selectOption("high");
  await expect
    .poll(() => materialColor(page, "primary"))
    .not.toBe(standardPrimary);
  await appearance.selectOption("light");
  await expect(root).toHaveAttribute("data-mantine-color-scheme", "light");
  await expect(shell).not.toHaveCSS("background-color", originalSurface);
  expect((await nav.boundingBox())?.width).toBe(originalWidth);

  const canvas = await materialColor(page, "surface-container");
  const navigation = await materialColor(page, "surface-container");
  const list = await materialColor(page, "surface-bright");
  const selection = await materialColor(page, "secondary-container");
  const selectedText = await materialColor(page, "on-secondary-container");
  const dialogSurface = await materialColor(page, "surface-container-high");
  const sharedRoles = async () => {
    await expect(shell).toHaveCSS("background-color", canvas);
    await expect(nav).toHaveCSS("background-color", navigation);
    await page.mouse.move(0, 0);
    const indicator = nav.locator("a[aria-current] > span").first();
    await expect(indicator).toHaveCSS("background-color", selection);
    await expect(indicator).toHaveCSS("color", selectedText);
  };
  await sharedRoles();
  await expect(page.getByTestId("settings-row").first()).toHaveCSS(
    "background-color",
    list,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await nav.getByRole("link", { name: "首页" }).click();
  await sharedRoles();
  const workCard = page.locator('output[data-state="active"]');
  await expect(workCard).toHaveCSS("background-color", selection);
  await expect(workCard).toHaveCSS("color", selectedText);
  await expect(workCard.getByText("LKM", { exact: true })).toHaveCSS(
    "background-color",
    await materialColor(page, "primary"),
  );
  await expect(workCard.getByText("LKM", { exact: true })).toHaveCSS(
    "color",
    await materialColor(page, "on-primary"),
  );
  const status = page.getByRole("button", { name: /状态/ });
  await expect(status).toHaveCSS("background-color", list);
  await status.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCSS("background-color", dialogSurface);
  await expect(dialog.getByRole("heading").first()).toHaveCSS(
    "color",
    await materialColor(page, "on-surface"),
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(status).toBeFocused();

  await nav.getByRole("link", { name: "规则" }).click();
  await sharedRoles();
  const tabs = page.getByTestId("rules-tabs");
  await expect(tabs.locator("a[aria-current]")).toHaveCSS(
    "background-color",
    selection,
  );
  await expect(page.getByTestId("settings-row").first()).toHaveCSS(
    "background-color",
    list,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await nav.getByRole("link", { name: "设置" }).click();
  await page.reload();
  await expect(appearance).toHaveValue("light");
  await expect(spec).toHaveValue("2021");
  await expect(scheme).toHaveValue("vibrant");
  await expect(contrast).toHaveValue("high");
  await expect(page.getByRole("radio", { name: "海蓝" })).toBeChecked();
  await sharedRoles();
  await spec.selectOption("2025");
  await scheme.selectOption("monochrome");
  await expect(spec).toHaveValue("2025");
  await expect(
    page.getByTestId("settings-row-detail").filter({ hasText: /^2021$/ }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "演示场景" })
    .selectOption("builtin24");
  await page.getByRole("combobox", { name: "语言" }).selectOption("en");
  const reset = page.getByRole("button", { name: "Restore default colors" });
  await expect(reset).toContainText(
    "Dark · Slate · 2025 · Tonal Spot · Standard",
  );
  await reset.click();
  await expect(root).toHaveAttribute("lang", "en");
  await expect(root).toHaveAttribute("data-mantine-color-scheme", "dark");
  await expect(shell).toHaveCSS("background-color", originalSurface);
  await expect(
    page.getByRole("combobox", { name: "Demo scenario" }),
  ).toHaveValue("builtin24");
  await page.reload();
  await expect(page.getByRole("radio", { name: "Slate" })).toBeChecked();
  await expect(
    page.getByRole("combobox", { name: "Color specification" }),
  ).toHaveValue("2025");
  await expect(page.getByRole("combobox", { name: "Color style" })).toHaveValue(
    "tonalSpot",
  );
  await expect(
    page.getByRole("combobox", { name: "Color contrast" }),
  ).toHaveValue("standard");
});
