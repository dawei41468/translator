import { test, expect } from '@playwright/test';

test.describe('Conversation Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Basic setup - we'll need a way to bypass or automate login for E2E
    // For now, let's assume we can navigate to register and create a user
    await page.goto('/register');
    const email = `test-${Date.now()}@example.com`;
    await page.getByTestId('register-name').fill('Test User');
    await page.getByTestId('register-email').fill(email);
    await page.getByTestId('register-password').fill('Password123!');
    await page.getByTestId('register-submit').click();
    
    // Should be on dashboard
    await expect(page).toHaveURL(/.*dashboard/);
  });

  test('should create a room and enter it', async ({ page }) => {
    await page.click('[data-testid="create-room-button"]');
    
    // Should show the room code and Enter button
    await expect(page.locator('[data-testid="enter-room-button"]')).toBeVisible();
    
    const roomCode = await page.locator('.font-mono.text-2xl').textContent();
    expect(roomCode).toMatch(/[A-Z0-9]{6}/);

    await page.click('[data-testid="enter-room-button"]');
    
    // Should be in a room
    await expect(page).toHaveURL(new RegExp(`.*room/${roomCode}`));
    
    // Check for room UI elements
    await expect(page.locator('text=Waiting for others to join')).toBeVisible();
  });

  test('should allow toggling audio and solo mode', async ({ page }) => {
    await page.click('[data-testid="create-room-button"]');
    await page.click('[data-testid="enter-room-button"]');
    
    // Toggle audio
    const audioToggle = page.getByTestId('toggle-audio');
    await audioToggle.click();
    // Check if it's "on" (default was off)
    // The previous test checked for lucide-volume-2, let's stick to that or check aria-pressed
    await expect(audioToggle).toHaveAttribute('aria-pressed', 'true');
    
    await audioToggle.click();
    await expect(audioToggle).toHaveAttribute('aria-pressed', 'false');

    // Toggle solo mode
    const soloToggle = page.getByTestId('toggle-solo-mode');
    await expect(page.getByTestId('solo-language-select')).not.toBeVisible();
    
    await soloToggle.click();
    await expect(page.getByTestId('solo-language-select')).toBeVisible();
    await expect(soloToggle).toHaveAttribute('aria-pressed', 'true');

    await soloToggle.click();
    await expect(page.getByTestId('solo-language-select')).not.toBeVisible();
  });

  test('should allow recording toggle', async ({ page }) => {
    await page.click('[data-testid="create-room-button"]');
    await page.click('[data-testid="enter-room-button"]');

    const recordButton = page.getByTestId('toggle-recording');
    
    // Initially disabled because connection takes a moment
    // Wait for connection (indicator becomes green)
    await expect(page.locator('.bg-green-500')).toBeVisible({ timeout: 10000 });
    
    await expect(recordButton).toBeEnabled();
    await expect(recordButton).toHaveAttribute('aria-pressed', 'false');

    await recordButton.click();
    await expect(recordButton).toHaveAttribute('aria-pressed', 'true');
    await expect(recordButton).toHaveClass(/animate-pulse/);

    await recordButton.click();
    await expect(recordButton).toHaveAttribute('aria-pressed', 'false');
  });
});
