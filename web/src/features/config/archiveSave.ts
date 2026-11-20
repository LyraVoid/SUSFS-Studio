import type { Message } from "../../i18n/messages";
import {
  type ArchiveBridge,
  ArchiveCommandError,
  type SavedArchive,
} from "../../transport/archiveBridge";

export function archiveErrorMessage(error: unknown): Message {
  if (!(error instanceof ArchiveCommandError)) return "archiveCommandFailed";
  return (
    (
      {
        BUSY: "archiveBusy",
        REVISION_CONFLICT: "archiveConflict",
        RESULT_UNKNOWN: "archiveResultUnknown",
        STORE_CORRUPT: "archiveStoreCorrupt",
        STORE_UNTRUSTED: "archiveStoreUntrusted",
        DRAFT_MISSING: "archiveDraftMissing",
        STAGE_OPEN_FAILED: "archiveWriteFailed",
        STAGE_WRITE_FAILED: "archiveWriteFailed",
        STAGE_CLOSE_FAILED: "archiveWriteFailed",
        STAGE_UNAVAILABLE: "archiveWriteFailed",
        TIMEOUT: "archiveTimeout",
      } as Record<string, Message>
    )[error.code] ?? "archiveCommandFailed"
  );
}

export function hasArchiveWriter(archive?: ArchiveBridge) {
  return Boolean(
    archive?.writable && archive.prepare && archive.write && archive.save,
  );
}

export async function writeArchive(
  archive: ArchiveBridge,
  base: SavedArchive,
  bytes: Uint8Array,
  restore = false,
) {
  const commit = restore ? archive.restore : archive.save;
  if (!archive.writable || !archive.prepare || !archive.write || !commit)
    throw new ArchiveCommandError("STAGE_UNAVAILABLE");
  const stage = await archive.prepare();
  if (stage.revision !== base.revision || stage.baseline !== base.text)
    throw new ArchiveCommandError("REVISION_CONFLICT", true);
  await archive.write(stage.uploadPath, bytes);
  return commit(stage.token);
}
