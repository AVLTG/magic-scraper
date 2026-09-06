// Distinguishes "store has no matches" from "store blocked us" when a
// product-grid selector never appears. A no-results page must resolve to []
// (success, no banner); only a genuine block/timeout should throw and mark
// the store failed on the health dashboard.

const NO_RESULTS_RE = /no results|0 products|nothing found|no matches|didn't match anything/i;

export function pageShowsNoResults(bodyText: string): boolean {
  return NO_RESULTS_RE.test(bodyText ?? "");
}
