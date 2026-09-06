const mockLaunchBrowser = jest.fn()
const mockClose = jest.fn()
const mockScrapeETB = jest.fn()
const mockScrapeDCC = jest.fn()
const mockScrapeFTF = jest.fn()
const mockScrape401 = jest.fn()
const mockSetStoreHealth = jest.fn()

jest.mock('../src/lib/scrapeLGS/browser', () => ({
  launchBrowser: (...a: unknown[]) => mockLaunchBrowser(...a),
}))
jest.mock('../src/lib/scrapeLGS/scrapeETB', () => ({
  scrapeETB: (...a: unknown[]) => mockScrapeETB(...a),
}))
jest.mock('../src/lib/scrapeLGS/scrapeDCC', () => ({
  scrapeDCC: (...a: unknown[]) => mockScrapeDCC(...a),
}))
jest.mock('../src/lib/scrapeLGS/scrapeFTF', () => ({
  scrapeFTF: (...a: unknown[]) => mockScrapeFTF(...a),
}))
jest.mock('../src/lib/scrapeLGS/scrape401', () => ({
  scrape401: (...a: unknown[]) => mockScrape401(...a),
}))
jest.mock('@/lib/scraperHealthCache', () => ({
  setStoreHealth: (...a: unknown[]) => mockSetStoreHealth(...a),
}))

import { scrapeAllSites } from '../src/lib/scrapeLGS/scrapeAllSites'

const PROD = { title: 'Sol Ring (C21)', price: '$3.00', inventory: ['In Stock (1)'], condition: 'NM', image: '', link: '', store: '401 Games' }

describe('scrapeAllSites health writes', () => {
  beforeEach(() => {
    mockLaunchBrowser.mockReset(); mockClose.mockReset()
    mockScrapeETB.mockReset(); mockScrapeDCC.mockReset(); mockScrapeFTF.mockReset(); mockScrape401.mockReset()
    mockSetStoreHealth.mockReset()
    mockLaunchBrowser.mockResolvedValue({ close: mockClose })
    mockScrapeETB.mockResolvedValue([]); mockScrapeDCC.mockResolvedValue([])
    mockScrapeFTF.mockResolvedValue([]); mockScrape401.mockResolvedValue([PROD])
    mockSetStoreHealth.mockResolvedValue(undefined)
  })

  it('records success for all four stores including 401', async () => {
    const { products, failedStores } = await scrapeAllSites('Sol Ring')
    expect(products).toEqual([PROD])
    expect(failedStores).toEqual([])
    expect(mockSetStoreHealth).toHaveBeenCalledTimes(4)
    expect(mockSetStoreHealth).toHaveBeenCalledWith('401 Games', expect.objectContaining({ status: 'success' }))
  })

  it('marks a throwing store failed without losing other products', async () => {
    mockScrapeDCC.mockRejectedValue(new Error('boom'))
    const { products, failedStores } = await scrapeAllSites('Sol Ring')
    expect(products).toEqual([PROD])
    expect(failedStores).toEqual(['Dungeon Comics and Cards'])
    expect(mockSetStoreHealth).toHaveBeenCalledWith(
      'Dungeon Comics and Cards', expect.objectContaining({ status: 'failure', error: 'boom' })
    )
  })

  it('still returns products when a health write itself fails (best-effort)', async () => {
    mockSetStoreHealth.mockRejectedValueOnce(new Error('db down'))
    const { products, failedStores } = await scrapeAllSites('Sol Ring')
    expect(products).toEqual([PROD])
    expect(failedStores).toEqual([])
  })

  it('closes the browser even when health writes fail', async () => {
    mockSetStoreHealth.mockRejectedValue(new Error('db down'))
    await scrapeAllSites('Sol Ring')
    expect(mockClose).toHaveBeenCalled()
  })
})
