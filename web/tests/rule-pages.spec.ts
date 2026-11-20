import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, test } from "@playwright/test";
import fixture from "../../contracts/archive-v1.json" with { type: "json" };
import fixtures from "../../contracts/diagnostic-v1.json" with { type: "json" };

const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
const original = JSON.stringify(fixture, null, 2).replace(
  '"example": true',
  '"example": 18446744073709551615, "other": 1e+02',
);

async function host(
  context: BrowserContext,
  initial?: string,
  writable = true,
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
        /^\/system\/bin\/timeout (?:5|15) \/data\/adb\/modules\/susfs_studio\/bin\/studioctl (read|stage|save)(?: ([0-9a-f]{32}))?$/.exec(
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
      if (action !== "save" || match?.[2] !== token)
        throw new Error(`Unexpected command: ${command}`);
      saves++;
      if (baseline !== text) return reject("REVISION_CONFLICT");
      if (failure === "BUSY") return reject(failure);
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
    { ...fixtures, writable },
  );
  return {
    text: () => text,
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

test("all four rule pages edit, validate, remove and cancel before one confirmed save", async ({
  context,
  page,
}) => {
  const store = await host(context, original);
  await page.goto("/#/rules/paths");
  const dialog = page.getByRole("dialog");
  const name = (value: string) =>
    dialog.getByRole("button", { name: value, exact: true });
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
    await expect(name("更新草稿")).toBeDisabled();
    await name("取消").click();
    await group.getByRole("button", { name: old, exact: true }).click();
    await dialog.getByLabel("源路径").fill(next);
    if (route === "paths")
      await dialog.getByRole("switch", { name: "循环路径" }).check();
    if (title === "kstat 规则") {
      await expect(dialog.getByLabel("inode 编号")).toHaveValue(
        "18446744073709551615",
      );
      await dialog.getByLabel("inode 编号").fill("18446744073709551616");
      await expect(name("更新草稿")).toBeDisabled();
      await dialog.getByLabel("inode 编号").fill("18446744073709551614");
    }
    await name("更新草稿").click();
    await group.getByRole("button", { name: "新增规则" }).click();
    await dialog.getByLabel("源路径").fill(next);
    if (route === "redirect") {
      await dialog.getByLabel("目标路径").fill(next);
      await expect(name("更新草稿")).toBeDisabled();
      await dialog.getByLabel("目标路径").fill("/safe-target");
    }
    await name("更新草稿").click();
    await expect(dialog.getByRole("alert")).toContainText("路径重复");
    await dialog.getByLabel("源路径").fill(added);
    await name("更新草稿").click();
    await group.getByRole("button", { name: added, exact: true }).click();
    await name("移除规则").click();
    await name("移除规则").click();
    await expect(
      group.getByRole("button", { name: added, exact: true }),
    ).toHaveCount(0);
  }
  expect(store.text()).toBe(original);
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
  await page.getByRole("button", { name: "刷新设备归档" }).click();
  await expect(
    page.getByRole("button", { name: "/changed-redirect" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "设置" }).click();
  await page.getByRole("button", { name: "设备导出" }).click();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "设备导出" }).click();
  expect((await download).suggestedFilename()).toContain(
    digest(store.text() ?? "").slice(0, 12),
  );
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
    await tab.getByRole("button", { name: "更新草稿" }).click();
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

for (const failure of ["BUSY", "RESULT_UNKNOWN", "NO_RECEIPT"] as const) {
  test(`${failure} retains the draft and prevents a blind retry`, async ({
    context,
    page,
  }) => {
    const store = await host(context);
    store.failure(failure);
    await page.goto("/#/rules/paths");
    await expect(page.getByText("设备上尚无 Studio 归档")).toBeVisible();
    await page.getByRole("button", { name: "新增规则" }).click();
    await page.getByLabel("源路径").fill("/new-safe-rule");
    await page.getByRole("button", { name: "更新草稿" }).click();
    await page.getByRole("button", { name: "检查并确认保存" }).click();
    await page.getByRole("button", { name: "确认保存", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText(
      failure === "BUSY" ? "另一个写入正在进行" : "保存结果未知",
    );
    await expect(page.getByText("归档草稿尚未保存")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "检查并确认保存" }),
    ).toBeDisabled();
    const release = store.holdRead();
    await page.getByRole("button", { name: "刷新设备归档" }).click();
    release(store.text());
    if (failure === "BUSY")
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
  await page.goto("/#/rules/paths");
  await expect(page.getByText("演示数据", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "新增规则" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "检查并确认保存" }),
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
    await tab.goto("/#/rules/paths");
    await tab.getByText("设备归档原文").click();
    await expect(tab.locator("pre")).toHaveText(text);
    await expect(tab.getByRole("button", { name: "新增规则" })).toBeDisabled();
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
