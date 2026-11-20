// Zero-dependency client-side ZIP writer (Store / method 0 + standard CRC-32)

export interface ZipEntryInput {
  path: string;
  content: string;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(v: number): [number, number] {
  return [v & 0xff, (v >>> 8) & 0xff];
}

function u32(v: number): [number, number, number, number] {
  return [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
}

export function buildZipBlob(entries: ZipEntryInput[]): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((now.getSeconds() >> 1) & 0x1f);
  const dosDate = (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

  for (const entry of entries) {
    const cleanPath = entry.path.replace(/^\/+/, "");
    const nameBytes = encoder.encode(cleanPath);
    const dataBytes = encoder.encode(entry.content);
    const crc = crc32(dataBytes);

    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, // Local file header signature
      ...u16(20),             // Version needed (2.0)
      ...u16(0x0800),         // UTF-8 filename flag
      ...u16(0),              // Compression method: 0 (store)
      ...u16(dosTime),
      ...u16(dosDate),
      ...u32(crc),
      ...u32(dataBytes.length),
      ...u32(dataBytes.length),
      ...u16(nameBytes.length),
      ...u16(0),              // Extra field length
    ]);

    localParts.push(localHeader, nameBytes, dataBytes);

    const centralHeader = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, // Central directory header signature
      ...u16(20),             // Version made by
      ...u16(20),             // Version needed
      ...u16(0x0800),         // UTF-8 filename flag
      ...u16(0),              // Compression: store
      ...u16(dosTime),
      ...u16(dosDate),
      ...u32(crc),
      ...u32(dataBytes.length),
      ...u32(dataBytes.length),
      ...u16(nameBytes.length),
      ...u16(0),              // Extra len
      ...u16(0),              // Comment len
      ...u16(0),              // Disk start
      ...u16(0),              // Internal attrs
      ...u32(0),              // External attrs
      ...u32(offset),         // Relative offset of local header
    ]);

    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((acc, p) => acc + p.length, 0);
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,   // End of central directory signature
    ...u16(0),                // Disk number
    ...u16(0),                // Start disk
    ...u16(entries.length),   // Entries on disk
    ...u16(entries.length),   // Total entries
    ...u32(centralSize),
    ...u32(offset),
    ...u16(0),                // Comment length
  ]);

  const blobParts: BlobPart[] = [
    ...localParts.map((u) => new Uint8Array(u)),
    ...centralParts.map((u) => new Uint8Array(u)),
    new Uint8Array(eocd),
  ];
  return new Blob(blobParts, { type: "application/zip" });
}

export function triggerDownloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
