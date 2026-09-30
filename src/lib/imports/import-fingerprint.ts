import { createHash } from "node:crypto";

export function createImportFingerprint(
  fileBytes: Uint8Array,
  selectedWorksheetName: string | null,
): string {
  const hash = createHash("sha256").update(fileBytes);
  if (selectedWorksheetName !== null) {
    const worksheetIdentity = new TextEncoder().encode(selectedWorksheetName);
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, worksheetIdentity.byteLength, false);
    hash.update(new Uint8Array([0x00, 0x78, 0x6c, 0x73, 0x78, 0x00]));
    hash.update(length);
    hash.update(worksheetIdentity);
  }
  return hash.digest("hex");
}
