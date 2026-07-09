import { test, expect } from '@playwright/test';

async function registerAndLandOnDashboard(page: import('@playwright/test').Page, name: string) {
  await page.goto('/register');
  // Email local-part must not contain spaces from the display name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const email = `test-${slug}-${Date.now()}@example.com`;
  await page.getByTestId('register-name').fill(name);
  await page.getByTestId('register-email').fill(email);
  await page.getByTestId('register-password').fill('Password123!');
  await page.getByTestId('register-submit').click();
  await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 });
}

test.describe('Conversation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await registerAndLandOnDashboard(page, 'Test User');
  });

  test('should create a room and enter it', async ({ page }) => {
    await page.getByTestId('create-room-button').click();
    await expect(page.getByTestId('enter-room-button')).toBeVisible({ timeout: 15000 });

    const roomCode = await page.getByTestId('room-code-display').textContent();
    expect(roomCode).toMatch(/[A-Z0-9]{6}/);

    await page.getByTestId('enter-room-button').click();
    await expect(page).toHaveURL(new RegExp(`.*room/${roomCode}`));

    // Alone in room — waiting / disabled mic messaging
    await expect(page.getByTestId('toggle-recording')).toBeDisabled({ timeout: 15000 });
  });

  test('should allow toggling audio playback', async ({ page }) => {
    await page.getByTestId('create-room-button').click();
    await page.getByTestId('enter-room-button').click();

    const audioToggle = page.getByTestId('toggle-audio');
    await expect(audioToggle).toBeVisible({ timeout: 15000 });
    await expect(audioToggle).toHaveAttribute('aria-pressed', 'false');

    await audioToggle.click();
    await expect(audioToggle).toHaveAttribute('aria-pressed', 'true');

    await audioToggle.click();
    await expect(audioToggle).toHaveAttribute('aria-pressed', 'false');
  });
});
