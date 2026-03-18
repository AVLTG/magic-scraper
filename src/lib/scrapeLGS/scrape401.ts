import "server-only";
import type { Product, ScrapeCardProps } from "@/types/product";
import type { Browser } from "puppeteer-core";

// DOESNT SEEM TO WORK

export async function scrape401({ card, browser }: ScrapeCardProps & { browser: Browser }): Promise<Product[]> {
    const cardUrl = card.toLowerCase().replace(/\s+/g, '+');
    const url = `https://store.401games.ca/pages/search-results?q=${cardUrl}&filters=In+Stock,True`;

    const page = await browser.newPage();

    try {
        console.log('Navigating to:', url);
        
        // Set a real user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        
        // Use domcontentloaded instead of networkidle0 - much more forgiving
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        console.log('Page loaded, waiting for content...');
        
        // Wait progressively and check if products appear
        for (let i = 0; i < 20; i++) {
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            const hasProducts = await page.evaluate(() => {
                return document.querySelectorAll('.product-card').length > 0;
            });
            
            if (hasProducts) {
                console.log(`Products appeared after ${i + 1} seconds`);
                break;
            }
            
            if (i === 19) {
                console.log('Products never appeared after 20 seconds');
            }
        }
        
        // Give it 2 more seconds after products appear
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Extract data
        const products = await page.evaluate((cardName: string): Product[] => {
            const productElements = document.querySelectorAll('.product-card');
            const results: Product[] = [];
            const cardLower = cardName.toLowerCase();

            console.log(`Found ${productElements.length} total product cards`);

            productElements.forEach((product) => {
                try {
                    const titleEl = product.querySelector('.fs-product-title, .title, [class*="title"]') as HTMLElement | null;
                    const title = titleEl ? titleEl.textContent?.trim() || '' : '';

                    if (!title || !title.toLowerCase().includes(cardLower)) {
                        return;
                    }

                    const priceEl = product.querySelector('.price, [class*="price"]') as HTMLElement | null;
                    const price = priceEl ? priceEl.textContent?.trim() || '' : '';

                    const imageEl = product.querySelector('img') as HTMLImageElement | null;
                    let imageUrl = imageEl ? imageEl.getAttribute('src') || imageEl.src || '' : '';
                    if (imageUrl && imageUrl.startsWith('//')) {
                        imageUrl = 'https:' + imageUrl;
                    }
                    if (imageUrl) {
                        imageUrl = imageUrl.split('?')[0];
                    }

                    const linkEl = product.querySelector('a[href*="/products/"]') as HTMLAnchorElement | null;
                    const link = linkEl ? linkEl.href : '';

                    results.push({
                        title,
                        price,
                        inventory: ['In Stock'],
                        condition: 'N/A',
                        image: imageUrl,
                        link,
                        store: '401 Games',
                    });
                } catch (e) {
                    console.error('Error processing product:', e);
                }
            });

            return results;
        }, card);

        console.log(`Scraped ${products.length} products matching "${card}"`);
        return products;
    } catch (error) {
        console.error('401 Games scraping failed:', error);
        return [];
    } finally {
        await page.close();
    }
}