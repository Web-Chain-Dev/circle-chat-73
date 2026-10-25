import { describe, expect, it } from "vitest";
import { canCall, isFreshOffer } from "@/lib/call-rules";

describe("One-to-one calls", () => {
  it("allows calling a different user", () => expect(canCall("me", "peer", false)).toBe(true));
  it("does not call Saved Messages", () => expect(canCall("me", "me", false)).toBe(false));
  it("prevents a second simultaneous call", () => expect(canCall("me", "peer", true)).toBe(false));
  it("ignores stale ringing offers", () => expect(isFreshOffer("2026-10-25T00:00:00Z", Date.parse("2026-10-25T00:01:00Z"))).toBe(false));
  it("accepts a fresh incoming offer", () => expect(isFreshOffer("2026-10-25T00:00:00Z", Date.parse("2026-10-25T00:00:10Z"))).toBe(true));
});