import { test, expect } from '@playwright/test';

test.describe('Conversation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Basic setup - we'll need a way to bypass or automate login for E2E
    // For now, let's assume we can navigate to register and create a user
    await page.goto('/register');
    const email = `test-${Date.now()}@example.com`;
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'Password123!');
    await page.fill('input[name="name"]', 'Test User');
    await page.click('button[type="submit"]');
    
    // Should be on dashboard
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should create a room and enter it', async ({ page }) => {
    await page.click('text=Start New Conversation');
    
    // Should be in a room
    await expect(page).toHaveURL(/.*room\/[A-Z0-9]{6}/);
    
    // Check for room UI elements
    await expect(page.locator('text=Waiting for others to join')).toBeVisible();
    await expect(page.locator('button:has-text("Show QR Code")')).toBeVisible();
  });

  test('should allow toggling audio', async ({ page }) => {
    await page.click('text=Start New Conversation');
    
    const audioToggle = page.locator('button[aria-label*="audio"], button[aria-label*="volume"]');
    
    // Check initial state (default is off as per code)
    // Note: The actual label might vary, checking for icon/text
    const isOff = await audioToggle.locator('svg[class*="lucide-volume-x"]').isVisible();
    
    await audioToggle.click();
    
    // Should be on
    await expect(audioToggle.locator('svg[class*="lucide-volume-2"]')).toBeVisible();
  });
});
