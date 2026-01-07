import express from 'express';
import { synthesizeSpeech } from '../services/tts.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = express.Router();

/**
 * POST /api/tts/synthesize
 * Synthesizes text to speech using Google Cloud TTS.
 */
router.post('/synthesize', authenticate, async (req, res) => {
  const { text, languageCode, voiceName, ssmlGender } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'Text is required' });
  }

  if (!languageCode) {
    return res.status(400).json({ error: 'Language code is required' });
  }

  try {
    const audioContent = await synthesizeSpeech({
      text,
      languageCode,
      voiceName,
      ssmlGender,
    });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioContent.length,
    });

    res.send(audioContent);
  } catch (error) {
    logger.error('TTS route error', { error, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to synthesize speech' });
  }
});

export { router as ttsRouter };
