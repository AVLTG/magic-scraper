// Distinguishes "store has no matches" from "store blocked us" when a
// product-grid selector never appears. A no-results page must resolve to []
// (success, no banner); only a genuine block/timeout should throw and mark
// the store failed on the health dashboard.

const NO_RESULTS_RE = /\bno results\b|\bno products\b|\bnothing found\b|\bno matches\b|\bdidn[’']t match anything\b|\b0 (products|results|items)\b/i;

export function pageShowsNoResults(bodyText: string): boolean {
  return NO_RESULTS_RE.test(bodyText ?? "");
}

type GridPage = {
  waitForSelector: (selector: string, options?: { timeout?: number }) => Promise<unknown>;
  evaluate: (fn: () => string) => Promise<string>;
};

/**
 * Waits for a product grid; resolves true when it appears, false when the
 * page shows an empty-state (caller returns []), and throws the original
 * timeout when neither happens (likely blocked).
 */
export async function awaitGridOrEmpty(
  page: GridPage,
  selector: string,
  timeout: number,
  logPrefix: string,
  card: string
): Promise<boolean> {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch (selectorError) {
    const bodyText = await page
      .evaluate(() => document.body.innerText.slice(0, 2000))
      .catch(() => "");
    if (pageShowsNoResults(bodyText)) {
      console.log(`${logPrefix}: no results for "${card}"`);
      return false;
    }
    throw selectorError;
  }
}
