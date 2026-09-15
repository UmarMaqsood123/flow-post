import { describe, expect, it } from "vitest";
import { detectFileType, sanitizeFileName } from "../src/utils/fileType.util";

const bytes = (...values: number[]) => Buffer.from(values);

describe("detectFileType", () => {
  it("recognizes images by their magic bytes, whatever the file is called", () => {
    expect(detectFileType(bytes(0xff, 0xd8, 0xff, 0xe0), "anything.bin")?.mimeType).toBe(
      "image/jpeg",
    );
    expect(
      detectFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), "x")?.mimeType,
    ).toBe("image/png");
    expect(detectFileType(Buffer.from("GIF89a"), "x")?.mimeType).toBe("image/gif");
    expect(detectFileType(Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8 "), "x")?.mimeType).toBe(
      "image/webp",
    );
  });

  it("recognizes PDF and Office documents", () => {
    expect(detectFileType(Buffer.from("%PDF-1.7"), "x.pdf")?.mimeType).toBe("application/pdf");
    const zip = bytes(0x50, 0x4b, 0x03, 0x04, 0x14, 0x00);
    expect(detectFileType(zip, "deck.pptx")?.extension).toBe("pptx");
    expect(detectFileType(zip, "sheet.xlsx")?.extension).toBe("xlsx");
    const ole = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
    expect(detectFileType(ole, "legacy.doc")?.extension).toBe("doc");
  });

  it("rejects container formats with a mismatched extension", () => {
    expect(detectFileType(bytes(0x50, 0x4b, 0x03, 0x04), "archive.zip")).toBeNull();
    expect(detectFileType(bytes(0x50, 0x4b, 0x03, 0x04), "photo.png")).toBeNull();
    expect(
      detectFileType(bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1), "x.exe"),
    ).toBeNull();
  });

  it("accepts text only when it is valid UTF-8 with a text extension", () => {
    expect(detectFileType(Buffer.from("a,b\n1,2\n"), "data.csv")?.mimeType).toBe("text/csv");
    expect(detectFileType(Buffer.from("héllo"), "notes.txt")?.mimeType).toBe("text/plain");
    expect(detectFileType(Buffer.from("plain text"), "notes.html")).toBeNull();
    expect(detectFileType(bytes(0x68, 0x00, 0x69), "binary.txt")).toBeNull();
    expect(detectFileType(bytes(0xc3, 0x28), "invalid.txt")).toBeNull();
  });

  it("rejects unknown and dangerous formats", () => {
    expect(detectFileType(Buffer.from("MZ\x90\x00"), "app.pdf")).toBeNull();
    expect(detectFileType(Buffer.from("<svg></svg>"), "logo.svg")).toBeNull();
    expect(detectFileType(Buffer.alloc(0), "empty.png")).toBeNull();
  });
});

describe("detectFileType (video)", () => {
  const ftyp = (brand: string) =>
    Buffer.concat([
      bytes(0x00, 0x00, 0x00, 0x18),
      Buffer.from(`ftyp${brand}`),
      bytes(0x00, 0x00, 0x02, 0x00),
      Buffer.from("isomiso2"),
    ]);

  it("recognizes MP4, M4V and MOV by their ftyp box", () => {
    expect(detectFileType(ftyp("isom"), "clip.mp4")?.mimeType).toBe("video/mp4");
    expect(detectFileType(ftyp("mp42"), "clip.m4v")?.extension).toBe("m4v");
    expect(detectFileType(ftyp("qt  "), "clip.mov")?.mimeType).toBe("video/quicktime");
    expect(
      detectFileType(Buffer.concat([bytes(0, 0, 0, 8), Buffer.from("moov")]), "old.mov")?.mimeType,
    ).toBe("video/quicktime");
  });

  it("recognizes WebM but not other Matroska files", () => {
    const ebml = bytes(0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84);
    expect(detectFileType(Buffer.concat([ebml, Buffer.from("webm")]), "loop.webm")?.mimeType).toBe(
      "video/webm",
    );
    expect(detectFileType(Buffer.concat([ebml, Buffer.from("matroska")]), "movie.webm")).toBeNull();
  });

  it("rejects audio-only brands and mismatched extensions", () => {
    expect(detectFileType(ftyp("M4A "), "song.mp4")).toBeNull();
    expect(detectFileType(ftyp("isom"), "clip.png")).toBeNull();
    expect(detectFileType(ftyp("qt  "), "clip.mp4")).toBeNull();
  });
});

describe("sanitizeFileName", () => {
  it("strips directories, control and reserved characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\Report  Q1.pdf")).toBe("Report Q1.pdf");
    expect(sanitizeFileName('bad"name<>|*?.png')).toBe("badname.png");
    expect(sanitizeFileName("tab\tand\nnewline.txt")).toBe("tabandnewline.txt");
  });

  it("falls back when nothing usable remains and caps the length", () => {
    expect(sanitizeFileName("///")).toBe("file");
    expect(sanitizeFileName(`${"a".repeat(300)}.png`)).toHaveLength(200);
  });
});
