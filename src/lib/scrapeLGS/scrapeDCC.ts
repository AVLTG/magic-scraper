import "server-only";
import type { Browser } from "puppeteer-core";
import type { Product, ScrapeCardProps } from "@/types/product";

export async function scrapeDCC({ card, browser }: ScrapeCardProps & { browser: Browser }): Promise<Product[]> {
    const cardUrl = card.toLowerCase().replace(/\s+/g, '+');
    const url = `https://www.dungeoncomicsandcards.ca/search?q=${cardUrl}&type=product&filter.v.availability=1`;

    const page = await browser.newPage();

    try {        
        await page.setViewport({ width: 1920, height: 1080 });
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
                
        // Wait for the product list to appear
        try {
            await page.waitForSelector('.js-pagination-result', { timeout: 10000 });
        } catch (e) {
            console.log('No products found or timeout: ', e);
            return [];
        }
        
        // Give it a moment to fully render
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Extract product data
        const products = await page.evaluate((cardName: string): Product[] => {
            const productElements = document.querySelectorAll('.js-pagination-result');
            const results: Product[] = [];
            const cardLower = cardName.toLowerCase();

            productElements.forEach((product) => {
                try {
                    // Title - inside card__title
                    const titleEl = product.querySelector('.card__title a') as HTMLAnchorElement | null;
                    const title = titleEl ? titleEl.textContent?.trim() || '' : '';

                    if (!title || !title.toLowerCase().includes(cardLower)) {
                        return;
                    }

                    // Price - in price__current
                    const priceEl = product.querySelector('.price__current') as HTMLElement | null;
                    const price = priceEl ? priceEl.textContent?.trim() || '' : '';

                    // Inventory status
                    const inventoryEl = product.querySelector('.product-inventory__status') as HTMLElement | null;
                    const inventoryText = inventoryEl ? inventoryEl.textContent?.trim() || '' : '';
                    const inventory = inventoryText ? [inventoryText] : ['In Stock'];

                    // Image
                    const imageEl = product.querySelector('img') as HTMLImageElement | null;
                    let imageUrl = '';
                    if (imageEl) {
                        // Try srcset first, then src
                        const srcset = imageEl.getAttribute('srcset');
                        if (srcset) {
                            // Get the highest quality image from srcset
                            const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
                            imageUrl = urls[urls.length - 1] || '';
                        } else {
                            imageUrl = imageEl.getAttribute('src') || imageEl.src || '';
                        }
                        
                        if (imageUrl && imageUrl.startsWith('//')) {
                            imageUrl = 'https:' + imageUrl;
                        }
                        // Remove query params
                        imageUrl = imageUrl.split('?')[0];
                    }

                    // Link
                    const linkEl = product.querySelector('a.js-prod-link') as HTMLAnchorElement | null;
                    const link = linkEl ? 'https://www.dungeoncomicsandcards.ca' + linkEl.getAttribute('href') : '';

                    results.push({
                        title,
                        price,
                        inventory,
                        condition: 'N/A',
                        image: imageUrl,
                        link,
                        store: 'Dungeon Comics and Cards',
                    });
                } catch (e) {
                    console.error('Error processing product:', e);
                }
            });

            return results;
        }, card);

        return products;
    } catch (error) {
        console.error('Dungeon Comics scraping failed:', error);
        return [];
    } finally {
        await page.close();
    }
}