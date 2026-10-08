const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/');
  
  // Wait for React to load
  await page.waitForTimeout(2000);
  
  // Click the autoscaler toggle
  await page.click('button:has(span[class*="transform"])');
  await page.waitForTimeout(1000);
  
  // Click Memory Leak
  await page.getByText('Memory Leak').click();
  
  // Wait 10 seconds for autoscaler to run
  await page.waitForTimeout(10000);
  
  await page.screenshot({ path: 'scratch/screenshot2.png', fullPage: true });
  await browser.close();
})();
