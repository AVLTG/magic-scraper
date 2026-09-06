import { pageShowsNoResults, awaitGridOrEmpty } from '@/lib/scrapeLGS/emptyState';

describe('pageShowsNoResults', () => {
  it.each([
    'No results found for "xyz"',
    'Showing 0 products',
    'No products found',
    'Sorry, nothing found.',
    'No matches for your search',
    'Your search didn’t match anything',
    "Your search didn't match anything",
  ])('detects empty state: %s', (text) => {
    expect(pageShowsNoResults(text)).toBe(true);
  });

  it.each([
    'Sol Ring (C21) $3.00 In Stock',
    'Showing 1–24 of 132 products',
    'Showing 20 products',
    'Showing 1-24 of 100 products',
    '',
  ])('does not false-positive: %s', (text) => {
    expect(pageShowsNoResults(text)).toBe(false);
  });
});

describe('awaitGridOrEmpty', () => {
  const gridPage = (bodyText: string, gridAppears = true) => ({
    waitForSelector: async () => {
      if (!gridAppears) throw new Error('Timeout');
    },
    evaluate: async () => bodyText,
  });

  it('resolves true when the grid appears', async () => {
    await expect(awaitGridOrEmpty(gridPage(''), '.grid', 10, 'T', 'card')).resolves.toBe(true);
  });

  it('resolves false on empty-state instead of throwing', async () => {
    await expect(
      awaitGridOrEmpty(gridPage('No results found', false), '.grid', 10, 'T', 'card')
    ).resolves.toBe(false);
  });

  it('rethrows the timeout when the page shows products', async () => {
    await expect(
      awaitGridOrEmpty(gridPage('Showing 20 products', false), '.grid', 10, 'T', 'card')
    ).rejects.toThrow('Timeout');
  });
});
