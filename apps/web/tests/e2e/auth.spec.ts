import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should allow public dashboard without login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.getByTestId('create-room-button')).toBeVisible();
  });

  test('should redirect unauthenticated users from protected routes', async ({ page }) => {
    await page.goto('/practice');
    await expect(page).toHaveURL(/.*login/);

    await page.goto('/profile');
    await expect(page).toHaveURL(/.*login/);
  });

  test('should show login form', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('h1')).toContainText('Live Translator');
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-password')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toBeVisible();
  });

  test('should show register form', async ({ page }) => {
    await page.goto('/register');

    await expect(page.locator('h1')).toContainText('Live Translator');
    await expect(page.getByTestId('register-email')).toBeVisible();
    await expect(page.getByTestId('register-password')).toBeVisible();
    await expect(page.getByTestId('register-name')).toBeVisible();
    await expect(page.getByTestId('register-submit')).toBeVisible();
  });
});

test.describe('Room Creation Flow', () => {
  test('should register, create a room, and enter it', async ({ page }) => {
    await page.goto('/register');
    const email = `test-auth-${Date.now()}@example.com`;
    await page.getByTestId('register-name').fill('Auth Tester');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill('Password123!');
    await page.getByTestId('register-submit').click();

    await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 });

    await page.getByTestId('create-room-button').click();
    await expect(page.getByTestId('room-code-display')).toBeVisible({ timeout: 15000 });
    const roomCode = await page.getByTestId('room-code-display').textContent();
    expect(roomCode).toMatch(/[A-Z0-9]{6}/);

    await page.getByTestId('enter-room-button').click();
    await expect(page).toHaveURL(new RegExp(`.*room/${roomCode}`));
  });
});
