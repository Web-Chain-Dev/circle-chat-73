import { describe, expect, it } from "vitest";
import { normalizeUsername, usernameError } from "@/lib/profile-rules";

describe("username rules", () => {
  it("strips @ and lowercases", () => expect(normalizeUsername(" @Milano_1 ")).toBe("milano_1"));
  it("rejects shorter than 5", () => expect(usernameError("abcd")).not.toBeNull());
  it("rejects symbols", () => expect(usernameError("ab-cde")).not.toBeNull());
  it("accepts valid", () => expect(usernameError("milano_1")).toBeNull());
});
