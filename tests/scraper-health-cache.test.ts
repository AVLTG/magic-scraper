const mockUpsert = jest.fn()
const mockFindUnique = jest.fn()
const mockFindMany = jest.fn()
jest.mock('@/lib/prisma', () => ({
  prisma: {
    storeHealth: {
      upsert: (...a: unknown[]) => mockUpsert(...a),
      findUnique: (...a: unknown[]) => mockFindUnique(...a),
      findMany: (...a: unknown[]) => mockFindMany(...a),
    },
  },
}))

import { getStoreHealth, setStoreHealth, getAllStoreHealth } from "@/lib/scraperHealthCache";

describe("scraperHealthCache (DB-backed)", () => {
  beforeEach(() => {
    mockUpsert.mockReset(); mockFindUnique.mockReset(); mockFindMany.mockReset()
  })

  describe("getStoreHealth", () => {
    it("returns unknown default for a store with no row", async () => {
      mockFindUnique.mockResolvedValue(null)
      await expect(getStoreHealth("Unknown Store XYZ")).resolves.toEqual({
        status: "unknown", lastRun: null, error: null,
      });
    });

    it("maps a DB row to health", async () => {
      mockFindUnique.mockResolvedValue({
        store: "Test Store A", status: "success",
        errorMessage: null, lastRun: new Date("2026-01-01T00:00:00.000Z"),
      });
      await expect(getStoreHealth("Test Store A")).resolves.toEqual({
        status: "success", lastRun: "2026-01-01T00:00:00.000Z", error: null,
      });
    });

    it("demotes unexpected status values to unknown", async () => {
      mockFindUnique.mockResolvedValue({
        store: "X", status: "weird", errorMessage: null, lastRun: new Date("2026-01-01T00:00:00.000Z"),
      });
      const health = await getStoreHealth("X");
      expect(health.status).toBe("unknown");
    });
  });

  describe("setStoreHealth", () => {
    it("upserts keyed by store name", async () => {
      mockUpsert.mockResolvedValue({})
      await setStoreHealth("Enter The Battlefield", {
        status: "failure", lastRun: "2026-01-02T00:00:00.000Z", error: "Navigation timeout",
      });
      expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({
        where: { store: "Enter The Battlefield" },
        update: expect.objectContaining({ status: "failure", errorMessage: "Navigation timeout" }),
      }));
    });
  });

  describe("getAllStoreHealth", () => {
    it("always includes all known stores, defaulting missing rows to unknown", async () => {
      mockFindMany.mockResolvedValue([
        { store: "401 Games", status: "success", errorMessage: null, lastRun: new Date("2026-01-03T12:00:00.000Z") },
      ]);
      const all = await getAllStoreHealth();
      expect(Object.keys(all)).toEqual([
        "Enter The Battlefield",
        "Dungeon Comics and Cards",
        "Face to Face Games",
        "401 Games",
      ]);
      expect(all["401 Games"]).toEqual({
        status: "success", lastRun: "2026-01-03T12:00:00.000Z", error: null,
      });
      expect(all["Enter The Battlefield"]).toEqual({ status: "unknown", lastRun: null, error: null });
    });
  });
});
