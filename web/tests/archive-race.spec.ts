import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import fixtures from "../../contracts/diagnostic-v1.json" with { type: "json" };

test("two pages retain independent drafts and must review a newer revision", async ({
  context,
  page,
}) => {
  const draft = (label: string) =>
    JSON.stringify({
      format: "susfs-studio",
      schema: 1,
      rules: { paths: [], maps: [], kstats: [], redirects: [] },
      label,
    });
  let text = draft("initial");
  let receipt: { revision: string; bytes: number; savedAt: string } | undefined;
  const stages = new Map<string, { baseline: string; upload?: string }>();
  const digest = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  let release = () => {};
  const bothStaged = new Promise<void>((resolve) => {
    release = resolve;
  });
  let uploads = 0;
  await context.exposeBinding(
    "archiveCall",
    async (_, command: string, upload: string) => {
      const [, action, token] =
        /studioctl (read|stage|save)(?: ([0-9a-f]{32}))?$/.exec(command) ?? [];
      const reply = (data: unknown) => ({
        protocol: 1,
        requestId: action,
        ok: true,
        data,
      });
      if (action === "read")
        return reply({
          kind: "saved",
          text,
          revision: digest(text),
          receipt,
          receiptStatus: receipt ? "available" : "missing",
        });
      if (action === "stage") {
        const id = (stages.size + 1).toString(16).padStart(32, "0");
        stages.set(id, { baseline: text });
        return reply({
          token: id,
          uploadPath: `/data/adb/susfs-studio/.staging/${id}.input`,
          baseline: text,
          revision: digest(text),
        });
      }
      const stage = stages.get(token ?? "");
      if (!stage) throw new Error("unexpected archive command");
      stage.upload = upload;
      if (++uploads === 2) release();
      await bothStaged;
      if (stage.baseline !== text)
        return {
          ...reply(undefined),
          ok: false,
          error: { code: "REVISION_CONFLICT", retryable: true },
        };
      text = upload;
      receipt = {
        revision: digest(text),
        bytes: text.length,
        savedAt: "1",
      };
      return reply(receipt);
    },
  );
  await context.addInitScript(({ hello, active }) => {
    const { archiveCall } = window as unknown as {
      archiveCall(command: string, upload: string): Promise<unknown>;
    };
    let upload = "";
    window.ksu = {
      exec: async (command: string, _options: string, callback: string) => {
        const data = command.endsWith(" hello")
          ? hello
          : command.endsWith(" status")
            ? active
            : await archiveCall(command, upload);
        const callbacks = window as unknown as Record<
          string,
          (code: number, output: string) => void
        >;
        callbacks[callback]?.(0, JSON.stringify(data));
      },
      io: () => ({
        version: () => 1,
        FileOutputStream: () => ({
          open: () => {
            upload = "";
            return "stream";
          },
          write: (_id: string, base64: string) => {
            upload += atob(base64);
            return true;
          },
          close: () => true,
        }),
      }),
    };
  }, fixtures);
  const second = await context.newPage();
  const dialogs = await Promise.all(
    [page, second].map(async (tab, index) => {
      await tab.goto("/#/rules/overview");
      await tab.getByRole("button", { name: "设备保存" }).click();
      const dialog = tab.getByRole("dialog");
      await dialog
        .locator("input[type=file]")
        .first()
        .setInputFiles({
          name: `page-${index}.json`,
          mimeType: "application/json",
          buffer: Buffer.from(draft(`page-${index}`)),
        });
      await dialog.getByRole("button", { name: "检查并确认保存" }).click();
      return dialog;
    }),
  );
  await Promise.all(
    dialogs.map((dialog) =>
      dialog.getByRole("button", { name: "确认保存", exact: true }).click(),
    ),
  );
  await expect.poll(() => text).not.toBe(draft("initial"));
  const winner = text === draft("page-0") ? 0 : 1;
  const winningDialog = dialogs[winner];
  const loser = dialogs[1 - winner];
  if (!winningDialog || !loser) throw new Error("both dialogs must be open");
  await expect(winningDialog.getByRole("status")).toContainText("保存完成");
  await expect(loser.getByRole("alert").last()).toContainText(
    "设备归档已有较新修订",
  );
  await expect(loser).toContainText(`page-${1 - winner}.json`);
  await expect(
    loser.getByRole("button", { name: "确认保存", exact: true }),
  ).toBeDisabled();
  await loser.getByRole("button", { name: "刷新设备归档" }).click();
  await expect(loser).toContainText("更改字段: /label");
  await expect(
    loser.getByRole("button", { name: "检查并确认保存" }),
  ).toBeEnabled();
  expect(text).toBe(draft(`page-${winner}`));
});
