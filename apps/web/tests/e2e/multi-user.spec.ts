import { test, expect } from '@playwright/test';

test.describe('Multi-user Conversation Flow', () => {
  test('two users should be able to chat in the same room', async ({ browser }) => {
    // 1. Setup User A (Room Creator)
    const contextA = await browser.newContext();
    // Grant microphone permission only if supported (Chromium)
    const browserName = browser.browserType().name();
    if (browserName === 'chromium') {
      await contextA.grantPermissions(['microphone']);
    }
    const pageA = await contextA.newPage();
    
    await pageA.goto('/register');
    const emailA = `user-a-${Date.now()}@example.com`;
    await pageA.getByTestId('register-name').fill('User A');
    await pageA.getByTestId('register-email').fill(emailA);
    await pageA.getByTestId('register-password').fill('Password123!');
    await pageA.getByTestId('register-submit').click();
    await expect(pageA).toHaveURL(/.*dashboard/);

    await pageA.getByTestId('create-room-button').click();
    const roomCode = await pageA.locator('.font-mono.text-2xl').textContent();
    expect(roomCode).toMatch(/[A-Z0-9]{6}/);

    await pageA.getByTestId('enter-room-button').click();
    await expect(pageA).toHaveURL(new RegExp(`.*room/${roomCode}`));
    await expect(pageA.locator('.bg-green-500')).toBeVisible({ timeout: 10000 });

    // 2. Setup User B (Joining User)
    const contextB = await browser.newContext();
    if (browserName === 'chromium') {
      await contextB.grantPermissions(['microphone']);
    }
    const pageB = await contextB.newPage();
    
    await pageB.goto('/register');
    const emailB = `user-b-${Date.now()}@example.com`;
    await pageB.getByTestId('register-name').fill('User B');
    await pageB.getByTestId('register-email').fill(emailB);
    await pageB.getByTestId('register-password').fill('Password123!');
    await pageB.getByTestId('register-submit').click();
    await expect(pageB).toHaveURL(/.*dashboard/);

    // User B joins via room code
    await pageB.getByTestId('room-code-input').fill(roomCode!);
    await pageB.getByTestId('join-room-button').click();
    await expect(pageB).toHaveURL(new RegExp(`.*room/${roomCode}`));
    await expect(pageB.locator('.bg-green-500')).toBeVisible({ timeout: 10000 });

    // 3. User A speaks (simulated by MockSttEngine)
    const recordButtonA = pageA.getByTestId('toggle-recording');
    await recordButtonA.click();
    await expect(recordButtonA).toHaveAttribute('aria-pressed', 'true');

    // The MockSttEngine will emit "This is a mock transcript" after 2 seconds
    // Wait for the message to appear for User A (own message)
    await expect(pageA.getByTestId('message-text').filter({ hasText: 'This is a mock transcript' })).toBeVisible({ timeout: 10000 });

    // User A stops recording
    await recordButtonA.click();
    await expect(recordButtonA).toHaveAttribute('aria-pressed', 'false');

    // 4. User B should receive the message from User A
    // Note: In the real app, User B would see the translated text.
    // If both users have the same language (en), they might see the original text.
    await expect(pageB.getByTestId('message-text').filter({ hasText: 'This is a mock transcript' })).toBeVisible({ timeout: 10000 });

    // 5. User B speaks back
    const recordButtonB = pageB.getByTestId('toggle-recording');
    await recordButtonB.click();
    await expect(recordButtonB).toHaveAttribute('aria-pressed', 'true');

    await expect(pageB.getByTestId('message-text').filter({ hasText: 'This is a mock transcript' }).nth(1)).toBeVisible({ timeout: 10000 });
    
    await recordButtonB.click();

    // User A should see User B's message
    await expect(pageA.getByTestId('message-text').filter({ hasText: 'This is a mock transcript' }).nth(1)).toBeVisible({ timeout: 10000 });

    // 6. Cleanup
    await contextA.close();
    await contextB.close();
  });
});
