import { describe, expect, it } from "vitest";
import { heat, series, share } from "./Branding";
import { joinSlides, minutesFor, moveSlide, parseSlide, slidesOf, splitSlides } from "./deck";
import { t, type Key } from "../i18n";
import { analytics } from "./Posts";
import { assignGaps } from "./PostsCalendar";
import { addDays, atTime, dayIso, isoWeek, monthDays, nearestTime, openGaps, suggestFor, weekStart, weekdayOf } from "./postdates";
import { inPool, stepOf, titleOf, type Post } from "./publishing";

const post = (id: string, extra: Partial<Post> = {}): Post => ({
  id, body: `Body of ${id}`, channel: "linkedin", created_at: `2026-01-0${id.length}T00:00:00Z`, updated_at: "2026-01-01T00:00:00Z",
  images: [], metrics: {}, origin: "owner", status: "draft", title: null, pillar: null, topic: null, org: null, kind: null,
  external_id: null, publish_run: null, published_at: null, scheduled_at: null, url: null, ...extra,
});

describe("posting calendar dates", () => {
  it("starts weeks on Monday and counts weekdays like the server", () => {
    const sunday = new Date(2026, 10, 8);
    expect(weekdayOf(sunday)).toBe(7);
    expect(dayIso(weekStart(sunday))).toBe("2026-11-02");
    expect(dayIso(weekStart(new Date(2026, 10, 2)))).toBe("2026-11-02");
    expect(isoWeek(new Date(2026, 10, 9))).toBe(46);
  });

  it("puts a day at a local time and finds the closest row", () => {
    const at = new Date(atTime(new Date(2026, 10, 10), "08:30"));
    expect([at.getHours(), at.getMinutes(), at.getDate()]).toEqual([8, 30, 10]);
    expect(nearestTime(["08:00", "12:00", "16:00"], "13:28")).toBe("12:00");
    expect(nearestTime([], "13:28")).toBeUndefined();
  });

  it("shows six full weeks for a month", () => {
    const days = monthDays(new Date(2026, 10, 1));
    expect(days).toHaveLength(42);
    expect(weekdayOf(days[0]!)).toBe(1);
    expect(dayIso(days[6]!)).toBe("2026-11-01");
    expect(dayIso(addDays(days[0]!, 41))).toBe(dayIso(days[41]!));
  });

  it("finds open gaps and fills them without suggesting a post twice", () => {
    const now = new Date("2026-11-07T12:00:00Z");
    const slot = (id: string, pillar: string | null = null) => ({ id, weekday: 2, time: "08:00", pillar, org: null });
    const calendar = [
      { at: "2026-11-03T08:00:00Z", posts: [], slot: slot("past") },
      { at: "2026-11-10T08:00:00Z", posts: ["x"], slot: slot("full") },
      { at: "2026-11-10T10:00:00Z", posts: [], slot: slot("a", "Product") },
      { at: "2026-11-11T08:00:00Z", posts: [], slot: slot("b") },
    ];
    const gaps = openGaps(calendar, now);
    expect(gaps.map((gap) => gap.slot.id)).toEqual(["a", "b"]);
    const pool = [post("p1", { pillar: "Practice" }), post("p22", { pillar: "Product" })];
    expect(suggestFor(pool, "Product")?.id).toBe("p22");
    expect(suggestFor(pool, "Product", 1)?.id).toBe("p1");
    const assigned = assignGaps(gaps, pool);
    expect(assigned.get("2026-11-10T10:00:00Za")?.id).toBe("p22");
    expect(assigned.get("2026-11-11T08:00:00Zb")?.id).toBe("p1");
  });
});

describe("posts", () => {
  it("knows the pool, the steps and the title", () => {
    expect(inPool(post("a"))).toBe(true);
    expect(inPool(post("a", { status: "idea" }))).toBe(true);
    expect(inPool(post("a", { status: "scheduled", scheduled_at: "2026-11-10T08:00:00Z" }))).toBe(false);
    expect(inPool(post("a", { status: "published" }))).toBe(false);
    expect(stepOf("idea")).toBe(0);
    expect(stepOf("publishing")).toBe(2);
    expect(titleOf(post("a", { body: "\n\nFirst line\nsecond" }))).toBe("First line");
    expect(titleOf(post("a", { title: "Own title" }))).toBe("Own title");
  });

  it("sums up what went out", () => {
    const stats = analytics([
      post("a", { status: "published", metrics: { impressions: 100, reactions: 10 } }),
      post("b", { status: "published", metrics: { impressions: 300, reactions: 20 } }),
      post("c", { metrics: { impressions: 999 } }),
    ]);
    expect(stats).toMatchObject({ count: 2, impressions: 400, reactions: 30, perPost: 15 });
    expect(stats.best?.id).toBe("b");
  });

  it("draws running totals and follower counts for branding", () => {
    const today = new Date(2026, 10, 7, 12);
    const out = [
      post("a", { status: "published", published_at: new Date(2026, 10, 5, 9).toISOString(), metrics: { impressions: 100, followers: 50, reactions: 4 } }),
      post("b", { status: "published", published_at: new Date(2026, 10, 7, 9).toISOString(), metrics: { impressions: 50, followers: 60, reactions: 2 } }),
    ];
    expect(series(out, "impressions", 4, today).values).toEqual([0, 100, 100, 150]);
    expect(series(out, "followers", 4, today).values).toEqual([0, 50, 50, 60]);
    expect(series(out, "impressions", 4, today).labels).toHaveLength(4);
    const cell = heat(out);
    expect(cell(weekdayOf(new Date(2026, 10, 5)), 9)).toBe(4);
    expect(cell(1, 9)).toBe(0);
    expect(share(0.37)).toBeCloseTo(37);
    expect(share(37)).toBe(37);
  });
});

describe("decks", () => {
  it("splits slides on a line with only --- like the server", () => {
    expect(splitSlides("# One\n\n---\n\n# Two\n---\n\n\n---\n# Three ---")).toEqual(["# One", "# Two", "# Three ---"]);
    expect(splitSlides(joinSlides(["# A", "# B"]))).toEqual(["# A", "# B"]);
  });

  it("chooses a layout from the content and keeps notes off the slide", () => {
    const slides = slidesOf("# Acme in 2027\n\nWhere we stand\n\nNote: Keep it short.\n\n---\n\n# 4.5 h\n\nA day of typing\n\n---\n\n# Points\n\n- One\n- Two\n\n---\n\n> We order at night.\n\nHead of sales\n\n---\n\n# Next step");
    expect(slides.map((slide) => slide.layout)).toEqual(["cover", "number", "bullets", "quote", "closing"]);
    expect(slides[0]).toMatchObject({ title: "Acme in 2027", sub: "Where we stand", note: "Keep it short." });
    expect(slides[2]!.items).toEqual(["One", "Two"]);
    expect(slides[3]).toMatchObject({ title: "We order at night.", sub: "Head of sales" });
    expect(parseSlide("# Plain\n\nA paragraph.\n\nAnother paragraph that is long enough to be text.", 1, 3).layout).toBe("text");
    expect(minutesFor(12)).toBe(18);
  });

  it("moves a slide", () => {
    expect(moveSlide(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveSlide(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(moveSlide(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("translations", () => {
  it("falls back for keys built from unknown server values", () => {
    expect(t("ready.kind.somethingnew" as Key)).toBe("somethingnew");
  });
});
