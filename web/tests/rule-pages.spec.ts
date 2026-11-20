import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import fixture from "../../contracts/archive-v1.json" with { type: "json" };
import fixtures from "../../contracts/diagnostic-v1.json" with { type: "json" };

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const original = JSON.stringify(fixture, null, 2).replace(
  '"example": true',
  '"example": 18446744073709551615, "other": 1e+02',
);

async function openOverview(page: Page) {
  await page
    .getByRole("navigation", { name: "规则分类" })
    .getByRole("link", { name: "概览" })
    .click();
}

test("explicit sample scenario closes the workflow without a host bridge", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await page.getByRole("button", { name: "演示场景", exact: true }).click();
  await page
    .getByRole("menuitemradio", { name: "完整流程案例（模拟）" })
    .click();
  await page.getByRole("link", { name: "规则", exact: true }).click();
  await page.getByRole("link", { name: "基础设置", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "受保护的应用", exact: true }).click();
  await dialog.getByRole("textbox").fill("reader");
  await dialog.getByRole("checkbox", { name: "org.example.reader" }).check();
  await dialog.getByRole("button", { name: "更新草稿" }).click();
  await page.getByRole("button", { name: "伪装 uname", exact: true }).click();
  await dialog.getByRole("tab", { name: "启动槽来源" }).click();
  await dialog.getByRole("button", { name: "案例启动槽 B" }).click();
  await expect(dialog.getByLabel("uname release")).toHaveValue("6.6.0-demo-b");
  await dialog.getByRole("button", { name: "更新草稿" }).click();
  await page
    .getByRole("button", { name: "伪装 cmdline / bootconfig", exact: true })
    .click();
  await dialog.getByRole("tab", { name: "启动槽来源" }).click();
  await dialog
    .getByRole("button", { name: "案例启动槽 A · bootconfig", exact: true })
    .click();
  await expect(dialog.getByLabel("伪装 cmdline / bootconfig")).toHaveValue(
    "example.bootconfig=a",
  );
  await dialog.getByRole("button", { name: "更新草稿" }).click();
  await openOverview(page);
  const apply = page.getByRole("button", { name: "模拟应用" });
  await expect(apply).toBeDisabled();
  await page.getByRole("button", { name: "检查并确认保存" }).click();
  await expect(dialog).toContainText("/settings");
  await expect(dialog).toContainText("/uname");
  await expect(dialog).toContainText("/cmdline");
  await dialog.getByRole("button", { name: "确认保存", exact: true }).click();
  for (const outcome of [
    "模拟：等待重启",
    "模拟：已受理",
    "模拟：部分成功",
    "模拟：已拒绝",
  ]) {
    await apply.click();
    await dialog.getByRole("radio", { name: outcome, exact: true }).click();
    await dialog.getByRole("button", { name: "确认模拟" }).click();
    await expect(
      page.getByTestId("settings-row").filter({ hasText: outcome }).first(),
    ).toBeVisible();
  }
  await apply.click();
  await dialog
    .getByRole("radio", { name: "模拟：结果未知", exact: true })
    .click();
  await dialog.getByRole("button", { name: "确认模拟" }).click();
  await expect(
    page
      .getByTestId("settings-row")
      .filter({ hasText: "模拟：结果未知" })
      .first(),
  ).toBeVisible();
  await expect(apply).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "刷新并核对", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "刷新", exact: true }).click();
  await expect(apply).toBeEnabled();
  await apply.click();
  await dialog
    .getByRole("radio", { name: "模拟：已受理", exact: true })
    .click();
  await dialog.getByRole("button", { name: "确认模拟" }).click();
  await expect(page.getByText("未验证", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "模拟效果验证" }).click();
  await expect(page.getByText("模拟：已独立观察")).toBeVisible();
  await expect(
    page
      .getByTestId("settings-row")
      .filter({ hasText: "案例运行实例" })
      .first(),
  ).toContainText("6");
  await page.getByRole("link", { name: "基础设置", exact: true }).click();
  await page.getByRole("button", { name: "日志记录", exact: true }).click();
  await dialog.getByRole("radio", { name: "关闭", exact: true }).click();
  await openOverview(page);
  await expect(page.getByText("模拟：已独立观察")).toBeVisible();
  await expect(
    page.getByText("该模拟结果对应旧版归档，不代表当前配置。", {
      exact: true,
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "检查并确认保存" }).click();
  await dialog.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect(
    page.getByText("该模拟结果对应旧版归档，不代表当前配置。", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "模拟效果验证" }),
  ).toBeDisabled();
  const exportLabel = "导出案例归档";
  await page.getByRole("button", { name: exportLabel, exact: true }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: exportLabel, exact: true }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toMatch(/\.json$/);
  const filePath = await exported.path();
  if (!filePath) throw new Error("Missing sample export");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "恢复备份", exact: true }).click();
  await dialog.locator('input[type="file"]').first().setInputFiles(filePath);
  await dialog.getByRole("button", { name: "检查并确认恢复" }).click();
  await dialog.getByRole("button", { name: "确认恢复", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("恢复完成");
  await page.reload();
  await expect(page.getByRole("button", { name: "模拟应用" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "应用到设备" })).toBeDisabled();
});

test("manual basic settings and stopping UID management remain archive drafts until confirmed", async ({
  context,
  page,
}) => {
  const initial = JSON.stringify({
    format: "susfs-studio",
    schema: 2,
    settings: { priorityUidFilter: [] },
    uname: { release: "example", version: "example", extra: true },
    rules: { paths: [], maps: [], kstats: [], redirects: [] },
  });
  const session = await host(context, initial);
  await page.goto("/#/rules/basic");
  const dialog = page.getByRole("dialog");
  await page.getByRole("button", { name: "伪装 uname", exact: true }).click();
  const release = dialog.getByLabel("uname release");
  await release.fill("字".repeat(22));
  await expect(dialog.getByRole("button", { name: "更新草稿" })).toBeDisabled();
  await release.fill("example-new");
  await dialog.getByRole("button", { name: "更新草稿" }).click();
  await page
    .getByRole("button", { name: "伪装 cmdline / bootconfig", exact: true })
    .click();
  await dialog.getByLabel("伪装 cmdline / bootconfig").fill("   ");
  await expect(dialog.getByRole("button", { name: "更新草稿" })).toBeDisabled();
  await dialog.getByLabel("伪装 cmdline / bootconfig").fill("example=value");
  await dialog.getByRole("button", { name: "更新草稿" }).click();
  await expect(
    page.getByRole("button", {
      name: "伪装 cmdline / bootconfig",
      exact: true,
    }),
  ).toContainText("example=value");
  await page
    .getByRole("button", { name: "恢复真实 cmdline / bootconfig" })
    .click();
  await page.getByRole("button", { name: "停止管理", exact: true }).click();
  await dialog.getByRole("button", { name: "停止管理", exact: true }).click();
  expect(session.text()).toBe(initial);
  await openOverview(page);
  await page.getByRole("button", { name: "检查并确认保存" }).click();
  for (const field of [
    "/uname/release",
    "/cmdline",
    "/settings/priorityUidFilter",
  ])
    await expect(dialog).toContainText(field);
  await dialog.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect
    .poll(() => JSON.parse(session.text() ?? "{}"))
    .toMatchObject({
      uname: { release: "example-new", version: "example", extra: true },
      cmdline: "",
      settings: {},
    });
  expect(JSON.parse(session.text() ?? "{}").settings).not.toHaveProperty(
    "priorityUidFilter",
  );
  await expect(page.getByRole("button", { name: "应用到设备" })).toBeDisabled();
});

test("imports only after confirmation and edits Schema 2 settings and extensions", async ({
  context,
  page,
}) => {
  const session = await host(context);
  await page.setViewportSize({ width: 360, height: 800 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#/rules/overview");
  const exchange = page.getByRole("button", { name: "SUSFS 配置交换" });
  await exchange.click();
  const dialog = page.getByRole("dialog");
  await dialog
    .locator("input[type=file]")
    .first()
    .setInputFiles({
      name: "exchange.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        '{"schema":2,"automatic":false,"settings":{"logging":true},"rules":[],"lkm":{"hidden_modules":[],"mount_prefixes":[]}}',
      ),
    });
  await expect(dialog).toContainText("新增字段: /settings");
  await expect.poll(session.saves).toBe(0);
  await dialog.getByRole("button", { name: "检查并确认保存" }).click();
  await dialog.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect(dialog.getByRole("status")).toContainText("保存完成");
  await page.keyboard.press("Escape");
  await expect(exchange).toBeFocused();
  await page.goto("/#/rules/basic");
  const apps = page.getByRole("button", { name: "受保护的应用" });
  await expect(apps).toContainText("设备未报告此能力");
  await expect(apps).toContainText("不管理");
  await apps.click();
  await expect(
    dialog.getByText("没有经验证的应用 UID 列表，仅可查看归档值。"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(apps).toBeFocused();
  const logging = page.getByRole("button", { name: "日志记录" });
  await expect(logging).toContainText("启用");
  await logging.click();
  await expect(dialog).toHaveCSS("border-radius", "28px");
  expect((await dialog.boundingBox())?.width).toBeLessThanOrEqual(328);
  await expect(dialog.getByRole("heading", { name: "日志记录" })).toHaveCSS(
    "font-size",
    "24px",
  );
  await expect(dialog.locator(".mantine-Modal-close")).toHaveCount(0);
  const choices = dialog.getByTestId("dialog-choice");
  await expect(choices).toHaveCount(3);
  await expect(choices.nth(1)).toHaveAttribute("data-selected", "true");
  await expect(dialog.getByTestId("dialog-actions")).toHaveCSS(
    "position",
    "sticky",
  );
  await expect(dialog.getByRole("radio", { name: "启用" })).toBeChecked();
  await dialog.getByRole("radio", { name: "关闭" }).click();
  await expect(logging).toContainText("关闭");
  await page.getByRole("link", { name: "扩展", exact: true }).click();
  const add = page.getByRole("button", { name: "添加：隐藏模块名" });
  const update = dialog.getByRole("button", { name: "仅保存" });
  await add.click();
  await dialog.getByLabel("隐藏模块名").fill("test_module");
  await update.click();
  await add.click();
  await dialog.getByLabel("隐藏模块名").fill("test_module");
  await update.click();
  await expect(
    dialog.getByText("值的格式无效、重复，或列表已达到上限。"),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  const entry = page.getByRole("button", { name: "test_module", exact: true });
  await entry.click();
  await dialog.getByLabel("隐藏模块名").fill("updated_module");
  await update.click();
  const remove = page.getByRole("button", {
    name: "移除条目：updated_module",
    exact: true,
  });
  await remove.click();
  await expect(dialog.getByText(/从归档草稿移除 updated_module/)).toBeVisible();
  await dialog.getByRole("button", { name: "取消" }).click();
  await openOverview(page);
  await page.getByRole("button", { name: "检查并确认保存" }).click();
  await expect(dialog).toContainText("/lkm/hiddenModules");
  await expect(dialog).toContainText("/settings/logging");
  await dialog.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect
    .poll(() => JSON.parse(session.text() ?? "{}"))
    .toMatchObject({
      settings: { logging: false },
      lkm: { hiddenModules: ["updated_module"] },
    });
  await page.getByRole("link", { name: "规则", exact: true }).click();
  await expect(page.getByRole("button", { name: "应用到设备" })).toBeDisabled();
});

test("a reviewed Schema 2 upgrade cannot overwrite a different baseline", async ({
  context,
  page,
}) => {
  const session = await host(context, original);
  await page.goto("/#/rules/overview");
  await page.getByRole("button", { name: "离线预览" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "预览升级至 Schema 2" }).click();
  await expect(dialog).toContainText("更改字段: /schema");
  const newer = original.replace("1e+02", "1e+03");
  session.replace(newer);
  await dialog.getByRole("button", { name: "刷新设备归档" }).click();
  await expect(dialog).toContainText("归档已变化；请关闭预览并重新检查升级。");
  await expect(
    dialog.getByRole("button", { name: "检查并确认保存" }),
  ).toBeDisabled();
  expect(session.text()).toBe(newer);
  expect(session.saves()).toBe(0);
});

async function host(
  context: BrowserContext,
  initial?: string,
  writable = true,
  provider: Record<string, unknown> = {},
) {
  let text = initial;
  let failure: string | undefined;
  let receipt: { revision: string; bytes: number; savedAt: string } | undefined;
  let baseline: string | undefined;
  let saves = 0;
  let readGate: Promise<string | undefined> | undefined;
  const token = "1".repeat(32);
  await context.exposeBinding(
    "ruleCall",
    async (_, command: string, upload: string) => {
      const match =
        /^\/system\/bin\/timeout (?:5|10|15) \/data\/adb\/modules\/susfs_studio\/bin\/studioctl (read|stage|save|import|plan)(?: ([0-9a-f]{32}))?$/.exec(
          command,
        );
      const action = match?.[1];
      const reply = (data: unknown) => ({
        protocol: 1,
        requestId: action,
        ok: true,
        data,
      });
      const reject = (code: string) => ({
        protocol: 1,
        requestId: action,
        ok: false,
        error: { code, retryable: true },
      });
      if (action === "read") {
        const gate = readGate;
        readGate = undefined;
        const snapshot = gate ? await gate : text;
        return reply(
          snapshot === undefined
            ? { kind: "empty" }
            : {
                kind: "saved",
                text: snapshot,
                revision: digest(snapshot),
                receipt,
                receiptStatus: receipt ? "available" : "missing",
              },
        );
      }
      if (action === "stage") {
        baseline = text;
        return reply({
          token,
          uploadPath: `/data/adb/susfs-studio/.staging/${token}.input`,
          baseline,
          revision: baseline === undefined ? undefined : digest(baseline),
        });
      }
      if (action === "plan" && match?.[2] === token) {
        return reply({
          planVersion: 2,
          id: token,
          baselineRevision: baseline === undefined ? null : digest(baseline),
          candidateRevision: digest(upload),
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
      }
      if ((action !== "save" && action !== "import") || match?.[2] !== token)
        throw new Error(`Unexpected command: ${command}`);
      saves++;
      if (baseline !== text) return reject("REVISION_CONFLICT");
      if (failure === "BUSY" || failure === "TIMEOUT") return reject(failure);
      text = upload;
      receipt = {
        revision: digest(upload),
        bytes: Buffer.byteLength(upload),
        savedAt: String(saves),
      };
      if (failure === "RESULT_UNKNOWN") return reject(failure);
      if (failure === "NO_RECEIPT") {
        const result = reply(receipt);
        receipt = undefined;
        return result;
      }
      return reply(receipt);
    },
  );
  await context.addInitScript(
    ({ hello, active, writable }) => {
      const ruleCall = (
        window as unknown as {
          ruleCall(command: string, upload: string): Promise<unknown>;
        }
      ).ruleCall;
      let bytes: number[] = [];
      window.ksu = {
        exec: async (command: string, _options: string, callback: string) => {
          const payload = command.endsWith(" hello")
            ? hello
            : command.endsWith(" status")
              ? active
              : await ruleCall(
                  command,
                  new TextDecoder().decode(Uint8Array.from(bytes)),
                );
          (
            window as unknown as Record<
              string,
              (code: number, output: string) => void
            >
          )[callback]?.(0, JSON.stringify(payload));
        },
        io: writable
          ? () => ({
              version: () => 1,
              FileOutputStream: () => ({
                open: () => {
                  bytes = [];
                  return "stream";
                },
                write: (_id: string, base64: string) => {
                  for (const char of atob(base64))
                    bytes.push(char.charCodeAt(0));
                  return true;
                },
                close: () => true,
              }),
            })
          : undefined,
      };
    },
    {
      ...fixtures,
      active: {
        ...fixtures.active,
        data: {
          ...fixtures.active.data,
          provider: { ...fixtures.active.data.provider, ...provider },
          control: { archiveImport: true },
        },
      },
      writable,
    },
  );
  return {
    text: () => text,
    replace: (next: string) => {
      text = next;
    },
    saves: () => saves,
    failure: (value?: string) => {
      failure = value;
    },
    holdRead: () => {
      let release = (_text?: string) => {};
      readGate = new Promise((resolve) => {
        release = resolve;
      });
      return release;
    },
  };
}

test("static kstat form follows explicitly reported fields", async ({
  context,
  page,
}) => {
  await host(context, original, true, { staticKstatFields: ["size"] });
  await page.goto("/#/rules/disguise");
  await page.getByRole("button", { name: "静态元数据规则" }).click();
  const dialog = page.getByRole("dialog");
  const field = dialog.getByLabel("文件大小");
  await expect(field).toBeVisible();
  await expect(field).toHaveCSS("border-radius", "16px");
  await expect(field).toHaveCSS("min-height", "56px");
  await expect(dialog.getByLabel("inode 编号")).toHaveCount(0);
  await expect(dialog.getByLabel("状态变更时间（秒）")).toHaveCount(0);
  await expect(dialog).toContainText("报告的字段：size");
  await page.keyboard.press("Escape");
});

test("all four rule pages edit, validate, remove and cancel before one confirmed save", async ({
  context,
  page,
}) => {
  const store = await host(context, original);
  await page.goto("/#/rules/paths");
  const dialog = page.getByRole("dialog");
  const name = (value: string) =>
    dialog.getByRole("button", { name: value, exact: true });
  await page.getByRole("button", { name: "批量添加规则" }).click();
  const batchLooping = dialog.getByRole("switch", { name: "循环路径" });
  await expect(batchLooping).not.toBeChecked();
  await expect(batchLooping.locator("+ span")).toHaveCSS("width", "52px");
  await expect(batchLooping.locator("+ span")).toHaveCSS("height", "32px");
  await expect(batchLooping.locator("+ span > span")).toHaveCSS(
    "width",
    "24px",
  );
  await expect(batchLooping).toHaveCSS("width", "1px");
  await batchLooping.locator("+ span").click();
  await expect(batchLooping).toBeChecked();
  await name("取消").click();
  for (const [route, title, old, next, added] of [
    ["paths", "路径规则", "/example", "/changed-path", "/new-path"],
    [
      "disguise",
      "Map 规则",
      "/data/local/tmp/example",
      "/changed-map",
      "/new-map",
    ],
    [
      "disguise",
      "kstat 规则",
      "/system/bin/example",
      "/changed-kstat",
      "/new-kstat",
    ],
    [
      "redirect",
      "重定向规则",
      "/system/bin/example",
      "/changed-redirect",
      "/new-redirect",
    ],
  ] as const) {
    await page
      .getByRole("navigation", { name: "规则分类" })
      .locator(`a[href="#/rules/${route}"]`)
      .click();
    const group = page.getByRole("region", { name: title });
    await group.getByRole("button", { name: old, exact: true }).click();
    await dialog.getByLabel("源路径").fill("/../invalid");
    await expect(name("仅保存")).toBeDisabled();
    await name("取消").click();
    await group.getByRole("button", { name: old, exact: true }).click();
    await dialog.getByLabel("源路径").fill(next);
    if (route === "paths") {
      const looping = dialog.getByRole("switch", { name: "循环路径" });
      await looping.locator("+ span").click();
      await expect(looping).toBeChecked();
      await expect(looping.locator("+ span")).toHaveCSS("width", "52px");
      await expect(looping.locator("+ span > span")).toHaveCSS("width", "24px");
    }
    if (title === "kstat 规则") {
      await expect(dialog.getByLabel("inode 编号")).toHaveValue(
        "18446744073709551615",
      );
      await dialog.getByLabel("inode 编号").fill("18446744073709551616");
      await expect(name("仅保存")).toBeDisabled();
      await dialog.getByLabel("inode 编号").fill("18446744073709551614");
    }
    await name("仅保存").click();
    await group.getByRole("button", { name: "添加规则", exact: true }).click();
    if (title === "kstat 规则") {
      const clone = dialog.getByRole("switch", { name: "完整克隆" });
      await expect(clone).not.toBeChecked();
      await clone.locator("+ span").click();
      await expect(clone).toBeChecked();
      await clone.locator("+ span").click();
      await expect(clone).not.toBeChecked();
    }
    await dialog.getByLabel("源路径").fill(next);
    if (route === "redirect") {
      await expect(
        dialog.getByRole("radiogroup").getByRole("radio"),
      ).toHaveCount(5);
      await dialog.getByLabel("目标路径").fill(next);
      await expect(name("仅保存")).toBeDisabled();
      await dialog.getByLabel("目标路径").fill("/safe-target");
    }
    await name("仅保存").click();
    await expect(dialog.getByRole("alert")).toContainText("路径重复");
    await dialog.getByLabel("源路径").fill(added);
    await name("仅保存").click();
    const remove = group.getByRole("button", {
      name: `移除条目：${added}`,
      exact: true,
    });
    await remove.click();
    await name("取消").click();
    await expect(remove).toBeVisible();
    await remove.click();
    await name("移除已保存规则").click();
    await expect(
      group.getByRole("button", { name: added, exact: true }),
    ).toHaveCount(0);
  }
  expect(store.text()).toBe(original);
  await openOverview(page);
  const automatic = page.getByRole("switch", {
    name: "归档中的自动应用偏好（不会注册启动任务）",
  });
  await expect(automatic).not.toBeChecked();
  await expect(automatic.locator("+ span")).toHaveCSS("width", "52px");
  await expect(automatic.locator("+ span")).toHaveCSS("height", "32px");
  await expect(automatic.locator("+ span > span")).toHaveCSS("width", "24px");
  await page.getByRole("button", { name: "检查并确认保存" }).click();
  await expect(dialog).toContainText(digest(original));
  await expect(dialog).toContainText("/rules/kstats/0/static/inode");
  await expect(dialog).toContainText("不调用 SUSFS 写操作");
  await name("确认保存").click();
  await expect(page.getByRole("status")).toContainText("已保存，未应用");
  expect(store.saves()).toBe(1);
  expect(store.text()).toContain(
    '"example": 18446744073709551615, "other": 1e+02',
  );
  expect(store.text()).toContain('"futureStatField": true');
  expect(store.text()).toContain('"inode": "18446744073709551614"');
  await page
    .getByRole("navigation", { name: "规则分类" })
    .getByRole("link", { name: "重定向" })
    .click();
  await expect(
    page.getByRole("button", { name: "/changed-redirect", exact: true }),
  ).toBeVisible();
  await openOverview(page);
  await page.getByRole("button", { name: "设备导出" }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "设备导出" }).click();
  expect((await download).suggestedFilename()).toContain(
    digest(store.text() ?? "").slice(0, 12),
  );
});

test("Map batches preserve the entire draft on invalid or duplicate paths", async ({
  context,
  page,
}) => {
  const store = await host(context, original);
  await page.goto("/#/rules/disguise");
  const group = page.getByRole("region", { name: "Map 规则" });
  const dialog = page.getByRole("dialog");
  await group.getByRole("button", { name: "批量添加规则" }).click();
  const input = dialog.getByLabel("规则列表");
  const submit = dialog.getByRole("button", { name: "仅保存" });
  await input.fill("/fixture-a\nrelative");
  await expect(dialog).toContainText("第 2 行无效");
  await expect(submit).toBeDisabled();
  await input.fill("/fixture-a\n/data/local/tmp/example");
  await submit.click();
  await expect(dialog.getByRole("alert")).toContainText("路径重复");
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(group.getByRole("button", { name: "/fixture-a" })).toHaveCount(
    0,
  );
  await group.getByRole("button", { name: "批量添加规则" }).click();
  await input.fill("/fixture-a\n/fixture-b");
  await submit.click();
  await expect(
    group.getByRole("button", { name: "/fixture-a", exact: true }),
  ).toBeVisible();
  await expect(
    group.getByRole("button", { name: "/fixture-b", exact: true }),
  ).toBeVisible();
  expect(store.text()).toBe(original);
});

test("two rule sessions rebase only nonconflicting edits and require new review", async ({
  context,
  page,
}) => {
  const store = await host(context, original);
  const second = await context.newPage();
  for (const [tab, route, current, next] of [
    [page, "paths", "/example", "/path-a"],
    [second, "disguise", "/data/local/tmp/example", "/map-b"],
  ] as const) {
    await tab.goto(`/#/rules/${route}`);
    await tab.getByRole("button", { name: current, exact: true }).click();
    await tab.getByRole("dialog").getByLabel("源路径").fill(next);
    await tab.getByRole("button", { name: "仅保存" }).click();
    await openOverview(tab);
    await tab.getByRole("button", { name: "检查并确认保存" }).click();
  }
  await page.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("已保存，未应用");
  await second.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect(second.getByRole("alert")).toContainText("较新修订");
  await expect(
    second.getByRole("button", { name: "检查并确认保存" }),
  ).toBeDisabled();
  await second.getByRole("button", { name: "刷新设备归档" }).click();
  await second.getByRole("button", { name: "检查并确认保存" }).click();
  await expect(second.getByRole("dialog")).toContainText("/rules/maps/0/path");
  await expect(second.getByRole("dialog")).not.toContainText(
    "/rules/paths/0/path",
  );
  await second.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect(second.getByRole("status")).toContainText("已保存，未应用");
  expect(store.text()).toContain("/path-a");
  expect(store.text()).toContain("/map-b");
});

for (const failure of [
  "BUSY",
  "TIMEOUT",
  "RESULT_UNKNOWN",
  "NO_RECEIPT",
] as const) {
  test(`${failure} retains the draft and prevents a blind retry`, async ({
    context,
    page,
  }) => {
    const store = await host(context);
    store.failure(failure);
    await page.goto("/#/rules/overview");
    await expect(page.getByText("设备上尚无 Studio 归档")).toBeVisible();
    await page
      .getByRole("navigation", { name: "规则分类" })
      .getByRole("link", { name: "路径隐藏" })
      .click();
    await page.getByRole("button", { name: "添加规则", exact: true }).click();
    await page.getByLabel("源路径").fill("/new-safe-rule");
    await page.getByRole("button", { name: "仅保存" }).click();
    await openOverview(page);
    await page.getByRole("button", { name: "检查并确认保存" }).click();
    await page.getByRole("button", { name: "确认保存", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      failure === "BUSY"
        ? "另一个写入正在进行"
        : failure === "TIMEOUT"
          ? "设备操作超时"
          : "保存结果未知",
    );
    await expect(page.getByText("归档草稿尚未保存")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "检查并确认保存" }),
    ).toBeDisabled();
    const release = store.holdRead();
    await page.getByRole("button", { name: "刷新设备归档" }).click();
    release(store.text());
    if (failure === "BUSY" || failure === "TIMEOUT")
      await expect(
        page.getByRole("button", { name: "检查并确认保存" }),
      ).toBeEnabled();
    else if (failure === "RESULT_UNKNOWN")
      await expect(page.getByText("归档草稿尚未保存")).toHaveCount(0);
    else await expect(page.getByRole("alert")).toContainText("回执缺失");
    expect(store.saves()).toBe(1);
  });
}

test("no host, read-only host and unsupported archives do not expose device save", async ({
  browser,
  page,
}) => {
  await page.goto("/#/rules/overview");
  await expect(page.getByText("演示数据", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "检查并确认保存" }),
  ).toBeDisabled();
  await page
    .getByRole("navigation", { name: "规则分类" })
    .getByRole("link", { name: "路径隐藏" })
    .click();
  await expect(
    page.getByRole("button", { name: "添加规则", exact: true }),
  ).toBeDisabled();
  for (const [text, writable] of [
    [original, false],
    ['{"schema":2}', true],
    ["{broken", true],
  ] as const) {
    const context = await browser.newContext({
      reducedMotion: "reduce",
      viewport: { width: 840, height: 805 },
    });
    await host(context, text, writable);
    const tab = await context.newPage();
    await tab.goto("/#/rules/overview");
    if (text === original) {
      await expect(tab.getByText("设备归档原文")).toHaveCount(0);
    } else {
      await expect(tab.getByText("设备归档原文")).toBeVisible();
    }
    await tab
      .getByRole("navigation", { name: "规则分类" })
      .getByRole("link", { name: "路径隐藏" })
      .click();
    await expect(
      tab.getByRole("button", { name: "添加规则", exact: true }),
    ).toBeDisabled();
    if (!writable) {
      await tab.getByRole("button", { name: "/example", exact: true }).click();
      await expect(
        tab.getByRole("dialog").getByLabel("源路径"),
      ).toHaveAttribute("readonly", "");
      await tab.getByRole("dialog").evaluate(async (node) => {
        await Promise.allSettled(
          node.parentElement?.parentElement
            ?.getAnimations({ subtree: true })
            .map((animation) => animation.finished) ?? [],
        );
        await new Promise(requestAnimationFrame);
      });
      expect(
        (await new AxeBuilder({ page: tab }).analyze()).violations,
      ).toEqual([]);
    }
    await context.close();
  }
});
