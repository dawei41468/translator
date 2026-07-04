import express from 'express';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = express.Router();

const VOICE_SESSION_URL = 'https://api.x.ai/v1/realtime/client_secrets';
const DEFAULT_BASE_URL = 'https://api.x.ai/v1';

/**
 * POST /api/voice/ephemeral
 * Creates a short-lived ephemeral token for client-side Grok Voice realtime connections.
 * This keeps the API key server-side.
 */
router.post('/ephemeral', authenticate, async (req, res) => {
  const apiKey = process.env.GROK_API_KEY;
  const baseUrl = process.env.GROK_API_BASE_URL || DEFAULT_BASE_URL;

  if (!apiKey) {
    return res.status(500).json({ error: 'GROK_API_KEY is not configured' });
  }

  try {
    const expiresAfter = req.body?.expires_after?.seconds || 300; // 5 minutes default

    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/realtime/client_secrets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        expires_after: {
          seconds: expiresAfter,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      logger.error('Failed to create Grok Voice ephemeral token', {
        status: response.status,
        error: errorText,
      });
      return res.status(response.status).json({ 
        error: 'Failed to create voice session token',
        details: errorText 
      });
    }

    const data = await response.json();
    logger.info('Created Grok Voice ephemeral token', { userId: req.user!.id });

    // Normalize to { value, expires_at } for client
    const token = data.client_secret || data;
    res.json({
      value: token.value || token,
      expires_at: token.expires_at || null,
    });
  } catch (error) {
    logger.error('Voice ephemeral token error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: 'Failed to create voice session' });
  }
});

export { router as voiceRouter };