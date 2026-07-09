import { test, expect } from '@playwright/test';

/**
 * Multi-user presence: when a second participant joins, the host's mic unlocks.
 * Full S2S speech is not asserted here (requires live Grok Voice).
 */
test.describe('Multi-user Conversation Flow', () => {
  test('second user join unlocks recording for host', async ({ browser }) => {
    const contextA = await browser.newContext();
    await contextA.grantPermissions(['microphone']);
    const pageA = await contextA.newPage();

    await pageA.goto('/register');
    const emailA = `user-a-${Date.now()}@example.com`;
    await pageA.getByTestId('register-name').fill('User A');
    await pageA.getByTestId('register-email').fill(emailA);
    await pageA.getByTestId('register-password').fill('Password123!');
    await pageA.getByTestId('register-submit').click();
    await expect(pageA).toHaveURL(/.*dashboard/, { timeout: 15000 });

    await pageA.getByTestId('create-room-button').click();
    await expect(pageA.getByTestId('room-code-display')).toBeVisible({ timeout: 15000 });
    const roomCode = await pageA.getByTestId('room-code-display').textContent();
    expect(roomCode).toMatch(/[A-Z0-9]{6}/);

    await pageA.getByTestId('enter-room-button').click();
    await expect(pageA).toHaveURL(new RegExp(`.*room/${roomCode}`));

    // Host alone: mic disabled
    const recordButtonA = pageA.getByTestId('toggle-recording');
    await expect(recordButtonA).toBeDisabled({ timeout: 15000 });

    // User B joins
    const contextB = await browser.newContext();
    await contextB.grantPermissions(['microphone']);
    const pageB = await contextB.newPage();

    await pageB.goto('/register');
    const emailB = `user-b-${Date.now()}@example.com`;
    await pageB.getByTestId('register-name').fill('User B');
    await pageB.getByTestId('register-email').fill(emailB);
    await pageB.getByTestId('register-password').fill('Password123!');
    await pageB.getByTestId('register-submit').click();
    await expect(pageB).toHaveURL(/.*dashboard/, { timeout: 15000 });

    await pageB.getByTestId('room-code-input').fill(roomCode!);
    await pageB.getByTestId('join-room-button').click();
    await expect(pageB).toHaveURL(new RegExp(`.*room/${roomCode}`), { timeout: 15000 });

    // Presence update: both mics should become enabled
    await expect(recordButtonA).toBeEnabled({ timeout: 20000 });
    await expect(pageB.getByTestId('toggle-recording')).toBeEnabled({ timeout: 20000 });

    await contextA.close();
    await contextB.close();
  });
});
