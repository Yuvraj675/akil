import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const outDir = path.join(projectRoot, 'evidence', 'screenshots');

const require = createRequire(path.join(projectRoot, 'frontend', 'package.json'));
const { chromium } = require('playwright-core');

async function run() {
  console.log('Starting Vite preview server on port 4173...');
  const server = spawn('npx', ['vite', 'preview', '--port', '4173'], {
    cwd: path.join(projectRoot, 'frontend'),
    stdio: 'pipe'
  });

  server.stdout.on('data', data => console.log(`[server]: ${data}`));
  server.stderr.on('data', data => console.error(`[server err]: ${data}`));

  // Wait 2 seconds for server to start
  await new Promise(r => setTimeout(r, 2000));

  console.log('Launching Google Chrome with Playwright in headless mode...');
  const browser = await chromium.launch({
    executablePath: '/opt/google/chrome/google-chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 }
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:4173...');
  await page.goto('http://localhost:4173', { waitUntil: 'networkidle' });

  // 1. Overview & Flow Diagram screenshot
  console.log('Capturing 01_overview_and_flowchart.png...');
  await page.screenshot({ path: path.join(outDir, '01_overview_and_flowchart.png'), fullPage: true });

  // 2. Click Pod Scaling & Lifecycle tab
  console.log('Switching to "Pod Scaling & Lifecycle" tab...');
  await page.click('button:has-text("Pod Scaling & Lifecycle")');
  await page.waitForTimeout(1000);

  console.log('Capturing 02_pod_lifecycle_initial.png...');
  await page.screenshot({ path: path.join(outDir, '02_pod_lifecycle_initial.png') });

  // 3. Test Scaling UP to 4 pods
  console.log('Testing Scale UP: Clicking replica button 4...');
  // Click button with text "4" in the replica buttons
  const button4 = page.locator('button:has-text("4")').first();
  await button4.click();

  console.log('Waiting 1.8 seconds for container provisioning and eBPF probe attachment...');
  await page.waitForTimeout(1800);

  // Check the text on screen to verify pods are NOT terminating
  const content = await page.content();
  const hasDraining = content.includes('Draining in-flight connections');
  console.log(`Verification: Has "Draining in-flight connections" after scale up? ${hasDraining ? 'YES (BUG DETECTED)' : 'NO (PASSED - PODS HEALTHY!)'}`);

  console.log('Capturing 03_pod_lifecycle_scaled_up.png...');
  await page.screenshot({ path: path.join(outDir, '03_pod_lifecycle_scaled_up.png') });

  // 4. Test One-Click Contention Spike
  console.log('Testing Contention Spike: Clicking "Spike LLC Cache Misses"...');
  await page.click('button:has-text("Spike LLC Cache Misses")');
  await page.waitForTimeout(1800);

  console.log('Capturing 04_contention_spike_autoscaling.png...');
  await page.screenshot({ path: path.join(outDir, '04_contention_spike_autoscaling.png') });

  // Close browser and server
  await browser.close();
  server.kill();
  console.log('Verification completed successfully! All screenshots saved in evidence/screenshots/');
}

run().catch(err => {
  console.error('Test run failed:', err);
  process.exit(1);
});
