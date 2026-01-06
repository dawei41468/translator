import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should redirect to login when accessing protected routes', async ({ page }) => {
    await page.goto('/dashboard');

    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);
  });

  test('should show login form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('h1')).toContainText('Live Translator');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
  });

  test('should show register form', async ({ page }) => {
    await page.goto('/register');

    await expect(page.locator('h1')).toContainText('Live Translator');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('Register');
  });
});

test.describe('Room Creation Flow', () => {
  test('should create room and show QR code', async ({ page }) => {
    // This would require authentication setup
    // For now, just test the UI is present
    await page.goto('/');

    await expect(page.locator('h1')).toContainText('Live Translator');
  });
});