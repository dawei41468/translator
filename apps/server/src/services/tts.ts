import textToSpeech from '@google-cloud/text-to-speech';
import { logger } from '../logger.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

let ttsClient: textToSpeech.TextToSpeechClient | null = null;
const CACHE_DIR = path.resolve(process.cwd(), 'cache/tts');

// Ensure cache directory exists
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create TTS cache directory', { error });
  }
}

// Initial call
ensureCacheDir();

function getTtsClient() {
  if (!ttsClient) {
    ttsClient = new textToSpeech.TextToSpeechClient();
  }
  return ttsClient;
}

export interface TTSOptions {
  text: string;
  languageCode: string;
  voiceName?: string;
  ssmlGender?: 'MALE' | 'FEMALE' | 'NEUTRAL' | 'SSML_VOICE_GENDER_UNSPECIFIED';
}

function getCacheKey(options: TTSOptions): string {
  const data = JSON.stringify({
    text: options.text.trim().toLowerCase(),
    languageCode: options.languageCode,
    voiceName: options.voiceName,
    ssmlGender: options.ssmlGender,
  });
  return crypto.createHash('md5').update(data).digest('hex');
}

export async function synthesizeSpeech(options: TTSOptions): Promise<Buffer> {
  const cacheKey = getCacheKey(options);
  const cachePath = path.join(CACHE_DIR, `${cacheKey}.mp3`);

  // Try to serve from cache
  try {
    const cachedAudio = await fs.readFile(cachePath);
    logger.info('Serving TTS from cache', { cacheKey, text: options.text.substring(0, 20) });
    return cachedAudio;
  } catch (error) {
    // File not found or unreadable, proceed to synthesize
  }

  const client = getTtsClient();

  const request = {
    input: { text: options.text },
    voice: {
      languageCode: options.languageCode,
      name: options.voiceName,
      ssmlGender: options.ssmlGender,
    },
    audioConfig: {
      audioEncoding: 'MP3' as const,
      speakingRate: 1.0,
      pitch: 0,
      volumeGainDb: 0,
    },
  };

  try {
    const [response] = await client.synthesizeSpeech(request);
    if (!response.audioContent) {
      throw new Error('No audio content returned from Google Cloud TTS');
    }
    
    const audioBuffer = Buffer.from(response.audioContent as Uint8Array);

    // Save to cache asynchronously
    fs.writeFile(cachePath, audioBuffer).catch(err => {
      logger.error('Failed to save TTS to cache', { err, cacheKey });
    });

    return audioBuffer;
  } catch (error) {
    logger.error('Error in TTS synthesis', { error, options });
    throw error;
  }
}
