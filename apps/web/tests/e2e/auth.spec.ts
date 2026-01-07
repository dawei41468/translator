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
    await expect(page.getByTestId('login-email')).toBeVisible();
    await expect(page.getByTestId('login-password')).toBeVisible();
    await expect(page.getByTestId('login-submit')).toContainText('Sign In');
  });

  test('should show register form', async ({ page }) => {
    await page.goto('/register');

    await expect(page.locator('h1')).toContainText('Live Translator');
    await expect(page.getByTestId('register-email')).toBeVisible();
    await expect(page.getByTestId('register-password')).toBeVisible();
    await expect(page.getByTestId('register-name')).toBeVisible();
    await expect(page.getByTestId('register-submit')).toContainText('Register');
  });
});

test.describe('Room Creation Flow', () => {
  test('should create room and enter it after login', async ({ page }) => {
    // 1. Register a new user
    await page.goto('/register');
    const email = `test-auth-${Date.now()}@example.com`;
    await page.getByTestId('register-name').fill('Auth Tester');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill('Password123!');
    await page.getByTestId('register-submit').click();

    // 2. Should be on dashboard
    await expect(page).toHaveURL(/.*dashboard/);

    // 3. Create a room
    await page.getByTestId('create-room-button').click();
    
    // 4. Verify room code is shown
    await expect(page.locator('.font-mono.text-2xl')).toBeVisible();
    const roomCode = await page.locator('.font-mono.text-2xl').textContent();
    expect(roomCode).toMatch(/[A-Z0-9]{6}/);

    // 5. Enter room
    await page.getByTestId('enter-room-button').click();
    await expect(page).toHaveURL(new RegExp(`.*room/${roomCode}`));
  });
});