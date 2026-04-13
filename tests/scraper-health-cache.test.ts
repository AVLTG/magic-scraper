import { getStoreHealth, setStoreHealth, getAllStoreHealth } from "@/lib/scraperHealthCache";

describe("scraperHealthCache", () => {
  describe("getStoreHealth", () => {
    it("returns unknown default for unset store", () => {
      const health = getStoreHealth("Unknown Store XYZ");
      expect(health).toEqual({ status: "unknown", lastRun: null, error: null });
    });

    it("returns stored health after setStoreHealth", () => {
      const health = {
        status: "success" as const,
        lastRun: "2026-01-01T00:00:00.000Z",
        error: null,
      };
      setStoreHealth("Test Store A", health);
      expect(getStoreHealth("Test Store A")).toEqual(health);
    });

    it("returns failure health after setStoreHealth with error", () => {
      const health = {
        status: "failure" as const,
        lastRun: "2026-01-02T00:00:00.000Z",
        error: "Navigation timeout",
      };
      setStoreHealth("Test Store B", health);
      expect(getStoreHealth("Test Store B")).toEqual(health);
    });
  });

  describe("getAllStoreHealth", () => {
    it("includes 401 Games entry from module initialization", () => {
      const all = getAllStoreHealth();
      expect(all).toHaveProperty("401 Games");
      expect(all["401 Games"]).toEqual({
        status: "unknown",
        lastRun: null,
        error: null,
      });
    });

    it("includes entries set via setStoreHealth", () => {
      const health = {
        status: "success" as const,
        lastRun: "2026-01-03T12:00:00.000Z",
        error: null,
      };
      setStoreHealth("Enter The Battlefield", health);
      const all = getAllStoreHealth();
      expect(all["Enter The Battlefield"]).toEqual(health);
    });

    it("returns all stored entries as a plain object", () => {
      const all = getAllStoreHealth();
      expect(typeof all).toBe("object");
      expect(all).not.toBeNull();
      // Should include 401 Games (set at module init) plus any stores set above
      expect(Object.keys(all).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("setStoreHealth round-trip", () => {
    it("overwrites existing entry on second set", () => {
      const first = {
        status: "success" as const,
        lastRun: "2026-01-01T00:00:00.000Z",
        error: null,
      };
      const second = {
        status: "failure" as const,
        lastRun: "2026-01-02T00:00:00.000Z",
        error: "Timeout",
      };
      setStoreHealth("Overwrite Store", first);
      setStoreHealth("Overwrite Store", second);
      expect(getStoreHealth("Overwrite Store")).toEqual(second);
    });
  });
});
