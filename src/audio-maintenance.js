// Offline retry/retention hook for the same fictional local demo volume.
import { resolve } from 'node:path';
import { openDb } from './db.js';
import { createAudioService } from './audio.js';
if (process.env.NODE_ENV === 'production' || process.env.SEED_DEMO !== 'true' || process.env.FICTIONAL_AUDIO_DEMO !== 'true') throw new Error('Maintenance requires explicit nonproduction fictional audio opt-in');
const root = resolve(import.meta.dirname, '..');
const db = openDb(resolve(root, process.env.DATABASE_PATH || 'data/clinic.db'));
try {
  const directory = resolve(root, process.env.AUDIO_DIR || 'data/private-audio');
  for (const name of ['public','demo']) {
    const publicDir = resolve(root,name);
    if (directory === publicDir || directory.startsWith(publicDir + '/')) throw new Error('Audio storage must be outside served assets');
  }
  console.log(JSON.stringify(createAudioService(db,directory,{enabled:true}).sweep()));
} finally { db.close(); }
