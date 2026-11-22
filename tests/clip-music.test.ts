import { describe, expect, it } from "vitest";
import { formatClock, lanternShareUrl, parseClipParams } from "@/lib/share/clip-music";

const q = (o: Record<string, string>) => (k: string) => o[k] ?? null;

describe("shared clip music params", () => {
  it("accepts a video id or full YouTube URL and floors the start", () => {
    expect(parseClipParams(q({ yt: "4DEgk12u_Ss", t: "42.9" }))).toEqual({ videoId: "4DEgk12u_Ss", start: 42 });
    expect(parseClipParams(q({ yt: "https://youtu.be/4DEgk12u_Ss" }))).toEqual({ videoId: "4DEgk12u_Ss", start: 0 });
  });
  it("ignores junk", () => {
    expect(parseClipParams(q({ yt: "<script>" }))).toBeNull();
    expect(parseClipParams(q({}))).toBeNull();
    expect(parseClipParams(q({ yt: "4DEgk12u_Ss", t: "-5" }))?.start).toBe(0);
    expect(parseClipParams(q({ yt: "4DEgk12u_Ss", t: "abc" }))?.start).toBe(0);
  });
  it("builds the share link", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(lanternShareUrl("https://x.test", id)).toBe(`https://x.test/l/${id}`);
    expect(lanternShareUrl("https://x.test", id, { videoId: "4DEgk12u_Ss", start: 61 })).toBe(`https://x.test/l/${id}?yt=4DEgk12u_Ss&t=61`);
  });
  it("formats clock", () => {
    expect(formatClock(75)).toBe("1:15");
    expect(formatClock(3725)).toBe("1:02:05");
  });
});
