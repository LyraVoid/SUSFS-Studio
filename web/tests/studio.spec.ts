import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import fixtures from "../../contracts/diagnostic-v1.json" with { type: "json" };
import { translator } from "../src/i18n/messages";

const studioVersion = /^version=(.+)$/m.exec(
  readFileSync(new URL("../../module/module.prop", import.meta.url), "utf8"),
)?.[1];
if (!studioVersion) throw new Error("module.prop is missing version");

const choose = async (page: Page, label: string, option: string) => {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("menu", { name: label, exact: true })
    .getByRole("menuitemradio", { name: option, exact: true })
    .click();
};

const materialColor = (page: Page, role: string) =>
  page.locator("html").evaluate((root, name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(--md-sys-color-${name})`;
    root.append(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value;
  }, role);

const installOperationHost = async (
  page: Page,
  initialStatus: "ready" | "recovery_required" | "partial",
) =>
  page.addInitScript(
    ({ hello, active, archive, initialStatus: status }) => {
      const token = "0123456789abcdef0123456789abcdef";
      const revision = "a".repeat(64);
      const itemId = "fedcba9876543210fedcba9876543210";
      let saved = false;
      let planStatus: string = status;
      let effectStatus = "unverified";
      const commands: string[] = [];
      const reply = (requestId: string, data: unknown) =>
        JSON.stringify({ protocol: 1, requestId, ok: true, data });
      const item = (itemStatus: string) => ({
        id: itemId,
        idempotencyKey: "00112233445566778899aabbccddeeff",
        category: "paths",
        intent: "add",
        stage: "live",
        eligibility: "eligible",
        reason: "CAPABILITY_VERIFIED",
        effectProbe: "UID_PATH_VISIBILITY",
        recovery: "proc-remove",
        identityDigest: "b".repeat(64),
        executionUid: 0,
        status: itemStatus,
        attempts: itemStatus === "saved" ? 0 : 1,
      });
      const plan = () => ({
        planVersion: 2,
        id: token,
        baselineRevision: null,
        candidateRevision: revision,
        provider: {
          implementation: "lkm",
          version: "v2.3.0",
          variant: "GKI-LKM",
          audited: true,
          features: ["CONFIG_KSU_SUSFS_SUS_PATH"],
          bootId: "test-boot",
          uid: 0,
          procNodes: ["susfs_path"],
          redirectUidSchemes: [],
        },
        status: planStatus,
        effectStatus,
        createdAt: "1",
        updatedAt: "1",
        items: [
          {
            ...item(
              planStatus === "ready"
                ? "saved"
                : planStatus === "recovery_required"
                  ? "recovery_required"
                  : planStatus === "partial"
                    ? "partial"
                    : "applied",
            ),
            ...(effectStatus === "verified" && {
              effect: {
                observed: true,
                source: "uid-app-range",
                code: "PATH_VISIBILITY",
                valueDigest: "c".repeat(64),
              },
            }),
          },
        ],
      });
      const report = (
        reportStatus: string,
        reportEffect: string,
        itemStatus: string,
      ) => ({
        planId: token,
        status: reportStatus,
        effectStatus: reportEffect,
        saved: true,
        applied: itemStatus === "applied" ? [itemId] : [],
        failed: {},
        pendingReboot: [],
        deferred: [],
        blocked: {},
        unknown: [],
        items: [item(itemStatus)],
      });
      window.ksu = {
        exec: (command: string, options: string, callback: string) => {
          commands.push(command);
          if (options !== "{}") throw new Error("invalid options");
          let output: string;
          if (command.endsWith(" hello")) output = JSON.stringify(hello);
          else if (command.endsWith(" status")) output = JSON.stringify(active);
          else if (command.endsWith(" stage"))
            output = reply("stage", {
              token,
              uploadPath: `/data/adb/susfs-studio/.staging/${token}.input`,
              baseline: null,
              revision: null,
            });
          else if (command.includes(` plan ${token}`))
            output = reply("plan", plan());
          else if (command.endsWith(` save ${token}`)) {
            saved = true;
            output = reply("save", {
              revision,
              savedAt: "1760000000000",
              bytes: new TextEncoder().encode(archive).length,
            });
          } else if (command.endsWith(" read"))
            output = saved
              ? reply("read", {
                  kind: "saved",
                  text: archive,
                  revision,
                  receipt: {
                    revision,
                    savedAt: "1760000000000",
                    bytes: new TextEncoder().encode(archive).length,
                  },
                  receiptStatus: "available",
                })
              : reply("read", { kind: "empty", receiptStatus: "missing" });
          else if (command.includes(` apply-plan ${token}`)) {
            planStatus = "applied";
            output = reply(
              "apply-plan",
              report("applied", "unverified", "applied"),
            );
          } else if (command.includes(` verify-plan ${token}`)) {
            effectStatus = "verified";
            output = reply(
              "verify-plan",
              report("applied", "verified", "applied"),
            );
          } else if (command.includes(` recover-plan ${token}`)) {
            planStatus = "applied";
            output = reply(
              "recover-plan",
              report("recovered", "unverified", "recovery_required"),
            );
          } else if (command.includes(` retry-plan ${token}`)) {
            planStatus = "applied";
            output = reply(
              "retry-plan",
              report("applied", "unverified", "applied"),
            );
          } else if (command.includes(` operation-status ${token}`))
            output = reply("operation-status", plan());
          else throw new Error(`unexpected command: ${command}`);
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
      (window as unknown as Record<string, unknown>).__studioOperationCommands =
        commands;
    },
    {
      hello: fixtures.hello,
      active: fixtures.active,
      archive: JSON.stringify({
        format: "susfs-studio",
        schema: 2,
        rules: {
          paths: [
            {
              id: "operation-test",
              path: "/data/local/tmp/studio-operation",
              looping: false,
            },
          ],
          maps: [],
          kstats: [],
          redirects: [],
        },
      }),
      initialStatus,
    },
  );

const saveOperationArchive = async (page: Page, archiveName: string) => {
  await page.getByRole("button", { name: "设备保存" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: archiveName,
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          format: "susfs-studio",
          schema: 2,
          rules: {
            paths: [
              {
                id: "operation-test",
                path: "/data/local/tmp/studio-operation",
                looping: false,
              },
            ],
            maps: [],
            kstats: [],
            redirects: [],
          },
        }),
      ),
    });
  await dialog.getByRole("button", { name: "检查并确认保存" }).click();
  await dialog.getByRole("button", { name: "确认保存" }).click();
  await expect(dialog.getByRole("status")).toContainText("保存完成");
  await page.keyboard.press("Escape");
};

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

test("host, provider evidence and operation authorization stay separate", async ({
  page,
}) => {
  await page.addInitScript(
    ({ hello, active }) => {
      window.studioDiagnostics = {
        hello: () => JSON.stringify(hello),
        status: () => JSON.stringify(active),
      };
    },
    { hello: fixtures.hello, active: fixtures.active },
  );
  await page.goto("/#/rules/overview");
  const facts = page.getByTestId("segmented-list").first();
  await expect(facts).toContainText("已注入的只读诊断接口");
  await expect(facts).toContainText("已确认 · 协议 1 响应通过边界校验");
  await expect(facts).toContainText("CONFIG_KSU_SUSFS_SUS_PATH");
  const path = page
    .getByTestId("settings-row")
    .filter({ hasText: "路径规则" })
    .first();
  await expect(path).toContainText("接口报告可用");
  await expect(path).toContainText("操作资格：写入与效果验证均已授权");
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
    "信息",
  ]);
  await expect(
    page.getByRole("button", { name: "SUSFS Studio 版本" }),
  ).toContainText(studioVersion);
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
  await expect(page.getByText("扩展不可用", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加：隐藏模块名" }),
  ).toHaveCount(0);
  await menu.getByRole("link", { name: "设置" }).click();
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
});

test("settings follows the system by default and shows developer credits", async ({
  page,
}) => {
  await page.goto("/#/settings");
  const theme = page.getByRole("button", { name: "主题", exact: true });
  await expect(theme).toContainText("跟随系统");
  await theme.click();
  const menu = page.getByRole("menu", { name: "主题" });
  await expect(menu.getByRole("menuitemradio")).toHaveText([
    "跟随系统",
    "深色",
    "浅色",
  ]);
  await expect(
    menu.getByRole("menuitemradio", { name: "跟随系统" }),
  ).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");

  const developers = page.getByRole("region", { name: "开发者" });
  await expect(developers).toContainText("LyraVoid 团队");
  await expect(developers).toContainText("Matsuzaka Yuki");
  await expect(developers.locator("img")).toHaveAttribute(
    "src",
    "https://q.qlogo.cn/headimg_dl?dst_uin=3231515355&spec=640&img_type=jpg",
  );
  await expect(page.getByText("内核", { exact: true })).toHaveCount(0);
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
  const select = page.getByRole("button", { name: "主题", exact: true });
  await expect(page.getByRole("switch")).toHaveCount(0);
  await select.tap();
  const menu = page.getByRole("menu", { name: "主题" });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitemradio", { name: "深色" }).tap();
  await expect(menu).toBeHidden();
  await expect(select).toHaveCSS("outline-style", "none");
  await expect(select).toHaveCSS(
    "background-color",
    await materialColor(page, "surface-bright"),
  );
  await select.blur();
  await page.keyboard.press("Tab");
  await select.focus();
  await expect(select).toHaveCSS("outline-style", "solid");
  await context.close();
});

test("settings menu stays anchored and scrolls on a short phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await page.goto("/#/settings");
  const trigger = page.getByRole("button", { name: "配色风格", exact: true });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "配色风格" });
  const selected = menu.getByRole("menuitemradio", { checked: true });
  await expect(selected).toContainText("Tonal Spot");
  await expect(selected).toHaveCSS(
    "background-color",
    await materialColor(page, "secondary-container"),
  );
  await expect(selected.locator("svg")).toBeVisible();
  await expect
    .poll(async () => {
      const box = await menu.boundingBox();
      return (
        !!box &&
        box.x >= 15 &&
        box.y >= 15 &&
        box.x + box.width <= 305 &&
        box.y + box.height <= 465
      );
    })
    .toBe(true);
  expect(
    await menu.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await page.keyboard.press("End");
  await expect(menu.getByRole("menuitemradio").last()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.mouse.click(2, 2);
  await expect(menu).toBeHidden();
  await expect(trigger).toContainText("Tonal Spot");
});

test("tapping another setting dismisses an open menu without activating the row", async ({
  page,
}) => {
  await page.goto("/#/settings");
  const theme = page.getByRole("button", { name: "主题", exact: true });
  const contrast = page.getByRole("button", {
    name: "配色对比度",
    exact: true,
  });
  const box = await contrast.boundingBox();
  if (!box) throw new Error("Missing contrast trigger");
  await theme.click();
  await expect(page.getByRole("menu", { name: "主题" })).toBeVisible();
  await page.mouse.click(box.x + 20, box.y + box.height / 2);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(contrast).toHaveAttribute("aria-expanded", "false");
  await contrast.click();
  await expect(page.getByRole("menu", { name: "配色对比度" })).toBeVisible();
});

test("settings menu follows different touch positions on the same row", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    reducedMotion: "reduce",
    viewport: { width: 390, height: 850 },
  });
  const page = await context.newPage();
  await page.goto("/#/settings");
  const trigger = page.getByRole("button", { name: "主题", exact: true });
  const bounds = await trigger.boundingBox();
  if (!bounds) throw new Error("Missing settings trigger");
  const menu = page.getByRole("menu", { name: "主题" });
  for (const [x, y] of [
    [30, 12],
    [130, 42],
  ] as const) {
    await page.touchscreen.tap(bounds.x + x, bounds.y + y);
    await expect
      .poll(async () => Math.round((await menu.boundingBox())?.x ?? 0))
      .toBe(Math.round(bounds.x + x));
    await expect
      .poll(async () => Math.round((await menu.boundingBox())?.y ?? 0))
      .toBe(Math.round(bounds.y + y + 4));
    await page.touchscreen.tap(2, 2);
    await expect(menu).toBeHidden();
  }
  await context.close();
});

test("touch swipes switch adjacent rule categories without replacing vertical scroll", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 360, height: 805 },
  });
  const page = await context.newPage();
  const input = await context.newCDPSession(page);
  await page.goto("/#/rules/overview");
  const gesture = async (x: number, y: number, dx: number, dy: number) => {
    await input.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (const step of [0.25, 0.5, 0.75, 1]) {
      await input.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x + dx * step, y: y + dy * step }],
      });
    }
    await input.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
  };
  const content = page.getByTestId("rules-content");
  await gesture(240, 490, -20, -160);
  await expect
    .poll(() => content.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
  await expect(page).toHaveURL(/#\/rules\/overview$/);
  await gesture(80, 410, 155, 0);
  await expect(page).toHaveURL(/#\/rules\/overview$/);
  await gesture(265, 410, -165, 15);
  await expect(page).toHaveURL(/#\/rules\/basic$/);
  await gesture(265, 410, -165, 0);
  await expect(page).toHaveURL(/#\/rules\/paths$/);
  await gesture(80, 410, 165, 0);
  await expect(page).toHaveURL(/#\/rules\/basic$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/rules\/paths$/);
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
  const last = rows.last();
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
  expect(await style(last, "border-radius")).toBe("4px 4px 16px 16px");
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
  await expect(page.getByText("应用范围", { exact: true })).toHaveCount(0);
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
    await choose(page, "演示场景", translator("zh")(scenario));
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
  await choose(page, "演示场景", translator("zh")("builtin24"));
  await page.getByRole("link", { name: "规则", exact: true }).click();
  await page
    .getByRole("navigation", { name: "规则分类" })
    .getByRole("link", {
      name: "扩展",
    })
    .click();
  await expect(page.getByText("扩展不可用", { exact: true })).toBeVisible();
  await expect(
    page.getByText("隐藏模块和挂载路径前缀仅在受支持的 LKM Provider 下显示。"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "添加：隐藏模块名" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "添加：挂载路径前缀" }),
  ).toHaveCount(0);
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
          else if (command.includes(` plan ${token}`))
            output = reply("plan", {
              planVersion: 2,
              id: token,
              baselineRevision: saved ? revision : null,
              candidateRevision: revision,
              provider: {
                implementation: "unknown",
                version: "unreported",
                variant: "unknown",
                audited: false,
                features: [],
                bootId: "test-boot",
                uid: 0,
                procNodes: [],
                redirectUidSchemes: [],
              },
              status: "blocked",
              effectStatus: "unverified",
              reason: "PROVIDER_DIAGNOSTIC_FAILED",
              createdAt: "1",
              updatedAt: "1",
              items: [],
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
  await expect(page.getByText("设备归档原文")).toHaveCount(0);
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

test("saved operation plan requires confirmation and separate effect verification", async ({
  page,
}) => {
  await installOperationHost(page, "ready");
  await page.goto("/#/rules/overview");
  await saveOperationArchive(page, "operation-apply.json");
  await page.getByRole("button", { name: "应用到设备" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("确认应用计划");
  await expect(dialog).toContainText("先保存预写日志");
  await dialog.getByRole("button", { name: "确认应用计划" }).click();
  const application = page.locator('section[aria-label="设备应用"]');
  await expect(application).toContainText("已受理");
  await page.getByRole("button", { name: "验证独立效果" }).click();
  await expect(application).toContainText("独立效果核对：全部已观察");
  await expect(application).toContainText("独立效果：已观察");
  const commands = await page.evaluate(
    () =>
      (window as unknown as Record<string, string[] | undefined>)
        .__studioOperationCommands ?? [],
  );
  expect(
    commands.filter((command) => command.includes(" apply-plan ")),
  ).toHaveLength(1);
  expect(
    commands.filter((command) => command.includes(" verify-plan ")),
  ).toHaveLength(1);
});

test("unknown operation is inspected before recovery and never replayed", async ({
  page,
}) => {
  await installOperationHost(page, "recovery_required");
  await page.goto("/#/rules/overview");
  await saveOperationArchive(page, "operation-recover.json");
  await page.getByRole("button", { name: "读取并恢复未知状态" }).click();
  await expect(page.locator('section[aria-label="设备应用"]')).toContainText(
    "已重新核对",
  );
  const commands = await page.evaluate(
    () =>
      (window as unknown as Record<string, string[] | undefined>)
        .__studioOperationCommands ?? [],
  );
  expect(
    commands.filter((command) => command.includes(" apply-plan ")),
  ).toHaveLength(0);
  expect(
    commands.filter((command) => command.includes(" recover-plan ")),
  ).toHaveLength(1);
});

test("partial operation retries only after explicit confirmation", async ({
  page,
}) => {
  await installOperationHost(page, "partial");
  await page.goto("/#/rules/overview");
  await saveOperationArchive(page, "operation-retry.json");
  await page.getByRole("button", { name: "重试已知失败项" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("确认后仅重试已知失败项");
  await dialog.getByRole("button", { name: "确认重试失败项" }).click();
  await expect(page.locator('section[aria-label="设备应用"]')).toContainText(
    "已受理",
  );
  const commands = await page.evaluate(
    () =>
      (window as unknown as Record<string, string[] | undefined>)
        .__studioOperationCommands ?? [],
  );
  expect(
    commands.filter((command) => command.includes(" retry-plan ")),
  ).toHaveLength(1);
  expect(
    commands.filter((command) => command.includes(" apply-plan ")),
  ).toHaveLength(0);
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
                : command.includes(` plan ${token}`)
                  ? reply("plan", {
                      planVersion: 2,
                      id: token,
                      baselineRevision: null,
                      candidateRevision: "a".repeat(64),
                      provider: {
                        implementation: "unknown",
                        version: "unreported",
                        variant: "unknown",
                        audited: false,
                        features: [],
                        bootId: "test-boot",
                        uid: 0,
                        procNodes: [],
                        redirectUidSchemes: [],
                      },
                      status: "blocked",
                      effectStatus: "unverified",
                      reason: "PROVIDER_DIAGNOSTIC_FAILED",
                      createdAt: "1",
                      updatedAt: "1",
                      items: [],
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
    if (
      !request.url().startsWith("http://127.0.0.1:5177") &&
      !request.url().startsWith("https://q.qlogo.cn/")
    )
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
  await choose(page, "主题", "深色");
  const darkSurface = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundColor);
  await choose(page, "主题", "浅色");
  await choose(page, "语言", "English");
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
  await choose(page, "主题", "深色");
  await expect(root).toHaveAttribute("data-mantine-color-scheme", "dark");
  const nav = page.getByRole("navigation", { name: "主导航" });
  const spec = page.getByRole("button", { name: "配色规范", exact: true });
  const scheme = page.getByRole("button", { name: "配色风格", exact: true });
  const contrast = page.getByRole("button", {
    name: "配色对比度",
    exact: true,
  });
  const appearance = page.getByRole("button", { name: "主题", exact: true });
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
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemradio", { name: "2025" })).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(spec).toContainText("2021");
  await expect
    .poll(() => materialColor(page, "surface-container"))
    .not.toBe(seedSurface);
  const oldSecondary = await materialColor(page, "secondary-container");
  await choose(page, "配色风格", "鲜明（Vibrant）");
  await expect
    .poll(() => materialColor(page, "secondary-container"))
    .not.toBe(oldSecondary);
  const standardPrimary = await materialColor(page, "primary");
  await choose(page, "配色对比度", "高");
  await expect
    .poll(() => materialColor(page, "primary"))
    .not.toBe(standardPrimary);
  await choose(page, "主题", "浅色");
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
  await expect(appearance).toContainText("浅色");
  await expect(spec).toContainText("2021");
  await expect(scheme).toContainText("Vibrant");
  await expect(contrast).toContainText("高");
  await expect(page.getByRole("radio", { name: "海蓝" })).toBeChecked();
  await sharedRoles();
  await choose(page, "配色规范", "2025");
  await choose(page, "配色风格", "单色（Monochrome）");
  await expect(spec).toContainText("2021");
  await spec.click();
  await expect(
    page.getByRole("menuitemradio", { name: "2025" }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("menuitemradio", { name: "2025" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(spec).toBeFocused();
  await choose(page, "演示场景", translator("zh")("builtin24"));
  await choose(page, "语言", "English");
  const reset = page.getByRole("button", { name: "Restore default colors" });
  await expect(reset).toContainText(
    "Follow system · Slate · 2025 · Tonal Spot · Standard",
  );
  await reset.click();
  await expect(root).toHaveAttribute("lang", "en");
  const automaticScheme = await page.evaluate(() =>
    matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  );
  await expect(root).toHaveAttribute(
    "data-mantine-color-scheme",
    automaticScheme,
  );
  await expect(
    page.getByRole("button", { name: "Theme", exact: true }),
  ).toContainText("Follow system");
  await expect(
    page.getByRole("button", { name: "Demo scenario", exact: true }),
  ).toContainText(translator("en")("builtin24"));
  await page.reload();
  await expect(page.getByRole("radio", { name: "Slate" })).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Color specification", exact: true }),
  ).toContainText("2025");
  await expect(
    page.getByRole("button", { name: "Color style", exact: true }),
  ).toContainText("Tonal Spot");
  await expect(
    page.getByRole("button", { name: "Color contrast", exact: true }),
  ).toContainText("Standard");
});
