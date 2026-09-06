import { scrape401 } from '@/lib/scrapeLGS/scrape401';

const suggestFixture = {
  resources: {
    results: {
      products: [
        { title: 'Sol Ring (C21)', handle: 'sol-ring-c21', image: 'https://img/c21.png', url: '/products/sol-ring-c21' },
        { title: 'Sol Ring (LTC)', handle: 'sol-ring-ltc', image: 'https://img/ltc.png', url: '/products/sol-ring-ltc' },
        { title: 'Lightning Bolt', handle: 'bolt', image: '', url: '/products/bolt' },
        { title: 'Sol Ring (C21)', handle: 'sol-ring-c21', image: 'https://img/c21.png', url: '/products/dup' },
      ],
    },
  },
};

const c21Detail = {
  title: 'Sol Ring (C21)',
  variants: [
    { title: 'NM', price: 300, inventory_quantity: 1, available: true },
    { title: 'SP', price: 270, inventory_quantity: 0, available: false },
  ],
};

const ltcDetail = {
  title: 'Sol Ring (LTC)',
  variants: [{ title: 'MP', price: 225, inventory_quantity: 4, available: true }],
};

function mockFetch(routes: Record<string, { status: number; body: unknown } | Error>) {
  return (async (url: unknown) => {
    const u = String(url);
    const key = Object.keys(routes).find((k) => u.includes(k));
    if (!key) throw new Error(`unexpected URL: ${u}`);
    const r = routes[key];
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response;
  }) as typeof fetch;
}

describe('scrape401 (fetch-based)', () => {
  it('returns in-stock variants with condition + price, deduped by handle', async () => {
    const fetcher = mockFetch({
      'suggest.json': { status: 200, body: suggestFixture },
      'sol-ring-c21.js': { status: 200, body: c21Detail },
      'sol-ring-ltc.js': { status: 200, body: ltcDetail },
    });
    const products = await scrape401({ card: 'Sol Ring', fetcher });
    // NM C21 (SP has 0 stock) + MP LTC; dup handle + off-name Bolt excluded
    expect(products).toEqual([
      {
        title: 'Sol Ring (C21)',
        price: '$3.00',
        inventory: ['In Stock (1)'],
        condition: 'NM',
        image: 'https://img/c21.png',
        link: 'https://store.401games.ca/products/sol-ring-c21',
        store: '401 Games',
      },
      {
        title: 'Sol Ring (LTC)',
        price: '$2.25',
        inventory: ['In Stock (4)'],
        condition: 'MP',
        image: 'https://img/ltc.png',
        link: 'https://store.401games.ca/products/sol-ring-ltc',
        store: '401 Games',
      },
    ]);
  });

  it('returns [] on empty results and blank queries without fetching details', async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      return { ok: true, status: 200, json: async () => ({ resources: { results: { products: [] } } }) } as Response;
    }) as typeof fetch;
    expect(await scrape401({ card: 'No Such Card XYZ', fetcher })).toEqual([]);
    expect(calls).toBe(1);
    expect(await scrape401({ card: '   ', fetcher })).toEqual([]);
    expect(calls).toBe(1);
  });

  it('skips products whose detail fetch fails instead of failing the store', async () => {
    const fetcher = mockFetch({
      'suggest.json': { status: 200, body: suggestFixture },
      'sol-ring-c21.js': { status: 200, body: c21Detail },
      'sol-ring-ltc.js': new Error('timeout'),
      'bolt.js': { status: 200, body: { variants: [] } },
    });
    const products = await scrape401({ card: 'Sol Ring', fetcher });
    expect(products.map((p) => p.title)).toEqual(['Sol Ring (C21)']);
  });

  it('throws a typed error on suggest failure (surfaces as store failure, not silent empty)', async () => {
    const fetcher = mockFetch({ 'suggest.json': { status: 503, body: null } });
    await expect(scrape401({ card: 'Sol Ring', fetcher })).rejects.toThrow(/returned 503/);
    const netFail = mockFetch({ 'suggest.json': new Error('fetch failed') });
    await expect(scrape401({ card: 'Sol Ring', fetcher: netFail })).rejects.toThrow(/search failed/);
  });
});
