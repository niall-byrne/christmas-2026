import { describe, expect, it } from "vitest";
import { z } from "zod";
import { RealtimeChannel } from "@/lib/realtime/channel";

const testSchema = z.object({
  id: z.string().uuid(),
  text: z.string().trim().min(1).max(100),
});

describe("RealtimeChannel", () => {
  const channel = new RealtimeChannel("test:channel", testSchema);

  it("exposes the configured channel name", () => {
    expect(channel.name).toBe("test:channel");
  });

  it("validates and transforms valid input data", () => {
    const id = crypto.randomUUID();
    const result = channel.validate({ id, text: "  Hello World  " });

    expect(result).toEqual({ id, text: "Hello World" });
  });

  it("throws a ZodError when validating invalid data", () => {
    expect(() => channel.validate({ id: "not-a-uuid", text: "   " })).toThrow();
  });

  it("parses valid JSON strings into typed payloads", () => {
    const id = crypto.randomUUID();
    const raw = JSON.stringify({ id, text: "Valid message" });

    expect(channel.parse(raw)).toEqual({ id, text: "Valid message" });
  });

  it("returns null when parsing malformed JSON", () => {
    expect(channel.parse("{bad-json")).toBeNull();
  });

  it("returns null when JSON does not match the schema", () => {
    const raw = JSON.stringify({ id: "123", text: "" });
    expect(channel.parse(raw)).toBeNull();
  });
});
