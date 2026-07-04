import express from 'express';
import { ttsRegistry } from '../services/tts/index.js';
import { authenticate } from '../middleware/auth.js';
import { logger } from '../logger.js';

const router = express.Router();

/**
 * POST /api/tts/synthesize
 * Synthesizes text to speech using the user's preferred TTS engine.
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
    const userId = req.user!.id;
    const preferredTts = req.user!.preferences?.ttsEngine;
    if (preferredTts) {
      ttsRegistry.setUserPreference(userId, preferredTts);
    }

    const engine = ttsRegistry.getEngine(userId);
    logger.info('TTS synthesis request', {
      userId,
      text: text.substring(0, 50),
      languageCode,
      engine: engine.getName(),
      voiceName,
      ssmlGender
    });

    const audioContent = await engine.synthesize({
      text,
      languageCode,
      voiceName,
      ssmlGender,
    });

    logger.info('TTS synthesis success', {
      userId,
      audioLength: audioContent.length
    });

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioContent.length,
    });

    res.send(audioContent);
  } catch (error) {
    logger.error('TTS route error', {
      error: error instanceof Error ? error.message : String(error),
      userId: req.user?.id,
      text: text?.substring(0, 50),
      languageCode
    });
    res.status(500).json({ error: 'Failed to synthesize speech' });
  }
});

export { router as ttsRouter };
