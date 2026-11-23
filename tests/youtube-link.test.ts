import { describe, expect, it } from "vitest";
import { parseYouTubeId, parseYouTubeStart } from "@/lib/audio/youtube";

const ID = "4DEgk12u_Ss";

describe("parseYouTubeId", () => {
  it("accepts every common link shape", () => {
    for (const link of [
      ID,
      `https://www.youtube.com/watch?v=${ID}&list=RD1`,
      `https://m.youtube.com/watch?v=${ID}`,
      `https://music.youtube.com/watch?v=${ID}&si=abc`,
      `https://youtu.be/${ID}?si=xyz`,
      `https://www.youtube.com/shorts/${ID}`,
      `https://www.youtube.com/embed/${ID}`,
      `youtu.be/${ID}`,
      `www.youtube.com/watch?v=${ID}`,
    ])
      expect(parseYouTubeId(link), link).toBe(ID);
  });

  it("finds the link inside pasted share text", () => {
    expect(parseYouTubeId(`ฟังเพลงนี้สิ https://youtu.be/${ID}?si=Ab12 เพราะมาก`)).toBe(ID);
  });

  it("rejects non-YouTube input", () => {
    expect(parseYouTubeId("รำวงวันลอยกระทง")).toBeNull();
    expect(parseYouTubeId("https://example.com/watch?v=4DEgk12u_Ss")).toBeNull();
    expect(parseYouTubeId("https://www.youtube.com/@channel")).toBeNull();
    expect(parseYouTubeId("")).toBeNull();
  });
});

describe("parseYouTubeStart", () => {
  it("reads t= / start= in seconds or h/m/s", () => {
    expect(parseYouTubeStart(`https://youtu.be/${ID}?t=95`)).toBe(95);
    expect(parseYouTubeStart(`https://youtu.be/${ID}?t=95s`)).toBe(95);
    expect(parseYouTubeStart(`https://www.youtube.com/watch?v=${ID}&t=1m30s`)).toBe(90);
    expect(parseYouTubeStart(`https://www.youtube.com/embed/${ID}?start=12`)).toBe(12);
    expect(parseYouTubeStart(`https://youtu.be/${ID}`)).toBe(0);
    expect(parseYouTubeStart(`https://youtu.be/${ID}?t=junk`)).toBe(0);
  });
});
