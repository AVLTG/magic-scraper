import "server-only";
import type { Browser } from "puppeteer-core";
import type { Product, ScrapeCardProps } from "@/types/product";

export async function scrapeFTF({ card, browser }: ScrapeCardProps & { browser: Browser }): Promise<Product[]> {
    const cardUrl = card.toLowerCase().replace(/\s+/g, '-');
    const url = `https://facetofacegames.com/search?q=${cardUrl}&filter__Availability=In+Stock`;

    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.bb-card-wrapper', { timeout: 5000 });

        await page.evaluate(async () => {
            await new Promise<void>((resolve) => {
                let totalHeight = 0;
                const distance = 300;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 50);
            });
        });

        await new Promise(resolve => setTimeout(resolve, 500));

        // Extract data
        const products = await page.evaluate((cardName: string): Product[] => {
            const productElements = document.querySelectorAll('.bb-card-wrapper');
            const results: Product[] = [];
            const cardLower = cardName.toLowerCase();

            productElements.forEach((product) => {
                const titleEl = product.querySelector('.bb-card-title a') as HTMLAnchorElement | null;
                const imageEl = product.querySelector('.bb-card-img img') as HTMLImageElement | null;
                const title = titleEl ? titleEl.textContent?.trim() || '' : '';

                if (!title.toLowerCase().includes(cardLower)) return;

                let imageUrl = imageEl ? imageEl.getAttribute('src') || imageEl.src || '' : '';
                if (imageUrl && imageUrl.startsWith('//')) {
                    imageUrl = 'https:' + imageUrl;
                }
                if (imageUrl) {
                    imageUrl = imageUrl.split('?')[0];
                }

                const link = titleEl ? titleEl.href : '';

                const variants = product.querySelectorAll('.f2f-featured-variant');
                if (variants.length > 0) {
                    variants.forEach((variant) => {
                        const conditionEl = variant.querySelector('.f2f-fv-title-t') as HTMLElement | null;
                        const condition = conditionEl ? conditionEl.textContent?.trim() || 'N/A' : 'N/A';

                        const qtyEl = variant.querySelector('.f2f-fv-title-q span') as HTMLElement | null;
                        const qty = qtyEl ? qtyEl.textContent?.trim() || '0' : '0';

                        const priceEl = variant.querySelector('.price-item--regular') as HTMLElement | null;
                        const price = priceEl ? priceEl.textContent?.trim() || '' : '';

                        results.push({
                            title,
                            price,
                            inventory: [qty],
                            condition,
                            image: imageUrl,
                            link,
                            store: 'Face to Face Games',
                        });
                    });
                } else {
                    const priceEl = product.querySelector('.price-item--regular') as HTMLElement | null;
                    const inventoryEl = product.querySelector('.bb-card-inventory') as HTMLElement | null;

                    results.push({
                        title,
                        price: priceEl ? priceEl.textContent?.trim() || '' : '',
                        inventory: [inventoryEl ? inventoryEl.textContent?.trim() || '' : ''],
                        condition: 'N/A',
                        image: imageUrl,
                        link,
                        store: 'Face to Face Games',
                    });
                }
            });

        return results;
        }, card);
    
        return products;
    } finally {
        await page.close();
    }
}
