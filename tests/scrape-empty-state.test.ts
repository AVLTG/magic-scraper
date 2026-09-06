import { pageShowsNoResults } from '@/lib/scrapeLGS/emptyState';

describe('pageShowsNoResults', () => {
  it.each([
    'No results found for "xyz"',
    'Showing 0 products',
    'Sorry, nothing found.',
    'No matches for your search',
  ])('detects empty state: %s', (text) => {
    expect(pageShowsNoResults(text)).toBe(true);
  });

  it.each([
    'Sol Ring (C21) $3.00 In Stock',
    'Showing 1–24 of 132 products',
    '',
  ])('does not false-positive: %s', (text) => {
    expect(pageShowsNoResults(text)).toBe(false);
  });
});
