import { describe, expect, it } from "vitest";
import { blobToBase64 } from "./athinaApi";

describe("blobToBase64", () => {
  it("converts a blob to base64", async () => {
    const blob = new Blob(["hello world"], { type: "text/plain" });
    const base64 = await blobToBase64(blob);

    expect(base64).toBe("aGVsbG8gd29ybGQ=");
  });
});
