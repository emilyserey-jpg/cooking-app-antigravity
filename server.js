const express = require('express');
const multer  = require('multer');
const path    = require('path');
const OpenAI  = require('openai');

const app  = express();
const PORT = process.env.PORT || 8000;

const CF_ACCOUNT_ID   = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN    = process.env.CF_API_TOKEN;
const OPENAI_API_KEY  = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;

// OpenAI client (only created if key exists)
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Multer: keep uploaded files in memory (max 25MB — Whisper's limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Separate Multer for Gemini — supports up to 500MB video files
const geminiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
});

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Cloudflare Stream: Get a direct upload URL ────────────────────────────
app.post('/api/cf-upload-url', async (req, res) => {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN)
    return res.status(500).json({ error: 'Cloudflare Stream not configured.' });
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${CF_API_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxDurationSeconds: 3600, requireSignedURLs: false }),
      }
    );
    const data = await response.json();
    if (!data.success) return res.status(400).json({ error: data.errors?.[0]?.message });
    res.json({ uploadURL: data.result.uploadURL, uid: data.result.uid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Cloudflare Stream: Check video status ─────────────────────────────────
app.get('/api/cf-video-status/:uid', async (req, res) => {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) return res.status(500).json({ error: 'Not configured' });
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/${req.params.uid}`,
      { headers: { 'Authorization': `Bearer ${CF_API_TOKEN}` } }
    );
    const data = await response.json();
    if (!data.success) return res.status(400).json({ error: 'Not found' });
    res.json({
      uid:        data.result.uid,
      status:     data.result.status?.state,
      duration:   data.result.duration,
      thumbnail:  data.result.thumbnail,
      playbackUrl:`https://videodelivery.net/${data.result.uid}/manifest/video.m3u8`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI: Transcribe video with OpenAI Whisper ──────────────────────────────
// Transcribes ONCE — client should cache and reuse for all 3 AI actions.
app.post('/api/transcribe', upload.single('video'), async (req, res) => {
  if (!openai) return res.status(500).json({ error: 'OpenAI not configured. Add OPENAI_API_KEY.' });
  if (!req.file)  return res.status(400).json({ error: 'No video file provided.' });

  console.log(`[Whisper] Transcribing ${req.file.originalname} (${(req.file.size/1024/1024).toFixed(1)}MB)`);

  try {
    const { toFile } = require('openai');
    const file = await toFile(
      req.file.buffer,
      req.file.originalname || 'video.mp4',
      { type: req.file.mimetype || 'video/mp4' }
    );

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    console.log(`[Whisper] Done — ${transcription.text.length} chars, ${transcription.segments?.length} segments`);

    res.json({
      transcript: transcription.text,
      segments:   transcription.segments || [],
    });
  } catch (err) {
    console.error('[Whisper] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── AI: Write ingredients from transcript ─────────────────────────────────
app.post('/api/ai/ingredients', async (req, res) => {
  if (!openai) return res.status(500).json({ error: 'OpenAI not configured.' });
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: 'No transcript.' });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a recipe assistant. Extract a clean, formatted ingredients list from a cooking video transcript. List one ingredient per line with quantity and unit (e.g. "2 cups all-purpose flour"). Only list ingredients clearly mentioned. Be concise.',
        },
        { role: 'user', content: `Extract ingredients from this transcript:\n\n${transcript}` },
      ],
      max_tokens: 600,
      temperature: 0.3,
    });
    res.json({ ingredients: completion.choices[0].message.content.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI: Write step-by-step instructions from transcript ───────────────────
app.post('/api/ai/steps', async (req, res) => {
  if (!openai) return res.status(500).json({ error: 'OpenAI not configured.' });
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: 'No transcript.' });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a recipe writer. Convert a cooking video transcript into clear, numbered step-by-step instructions. Each step = one distinct action. Write in second person ("Add the flour..."). Be clear and concise. Maximum 10 steps.',
        },
        { role: 'user', content: `Write step-by-step instructions from this transcript:\n\n${transcript}` },
      ],
      max_tokens: 900,
      temperature: 0.4,
    });
    res.json({ steps: completion.choices[0].message.content.trim() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI: Auto-detect loop points (start + end) from transcript ────────────
app.post('/api/ai/loops', async (req, res) => {
  if (!openai) return res.status(500).json({ error: 'OpenAI not configured.' });
  const { transcript, segments } = req.body;
  if (!transcript) return res.status(400).json({ error: 'No transcript.' });

  const segmentText = (segments && segments.length > 0)
    ? segments.map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text.trim()}`).join('\n')
    : transcript;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a cooking video loop editor. Given timestamped transcript segments, identify distinct cooking steps and for each one, determine:
1. "time" — when the step STARTS (seconds, number)
2. "endTime" — when the loop should STOP and jump back to "time" (seconds, number). This is the last moment of that action before the next step begins.
3. "label" — short action name, max 4 words

Return JSON: { "steps": [ { "time": 5.2, "endTime": 18.7, "label": "Chop onions" }, ... ] }

Rules:
- endTime must always be AFTER time (endTime > time)
- Each step's endTime should be just before the next action starts
- The final step's endTime should be near the end of that action, not the end of the whole video
- Minimum 2 steps, maximum 12 steps
- Look for transitions: "now", "next", "then", "add", "place", "stir", "cook", "remove"
- Labels should be action verbs ("Chop onions", "Add flour", "Stir mixture")`,
        },
        { role: 'user', content: `Identify cooking step loop boundaries:\n\n${segmentText}` },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.2,
    });

    const result = JSON.parse(completion.choices[0].message.content);
    res.json({ loops: Array.isArray(result.steps) ? result.steps : [] });
  } catch (err) {
    console.error('[AI Loops] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── AI: Gemini video analysis (proper implementation via Google File API) ───
// Accepts the actual video file, uploads to Google's File API, then calls
// Gemini 1.5 Flash. Works on any size video, no transcription needed.
app.post('/api/ai/gemini-analyze', geminiUpload.single('video'), async (req, res) => {
  if (!GEMINI_API_KEY)
    return res.status(503).json({ error: 'GEMINI_API_KEY not set in Railway variables.' });
  if (!req.file)
    return res.status(400).json({ error: 'No video file received.' });

  const mimeType = req.file.mimetype || 'video/mp4';
  console.log(`[Gemini] Received file: ${req.file.originalname}, ${(req.file.size/1024/1024).toFixed(1)}MB`);

  try {
    // ── Step 1: Upload video to Google File API ──────────────────────────
    console.log('[Gemini] Uploading to Google File API...');
    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1/files?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': mimeType,
          'X-Goog-Upload-Content-Type': mimeType,
          'X-Goog-Upload-Protocol': 'raw',
        },
        body: req.file.buffer,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`File API upload failed (${uploadRes.status}): ${errText.slice(0, 300)}`);
    }

    const uploadData = await uploadRes.json();
    const fileUri   = uploadData.file?.uri;
    const fileName  = uploadData.file?.name;
    if (!fileUri) throw new Error('Google File API returned no file URI.');
    console.log(`[Gemini] File uploaded: ${fileUri}`);

    // ── Step 2: Wait for file to be ACTIVE (Gemini needs to process it) ──
    let fileState = uploadData.file?.state || 'PROCESSING';
    let attempts  = 0;
    while (fileState === 'PROCESSING' && attempts < 30) {
      await new Promise(r => setTimeout(r, 3000));
      const statusRes  = await fetch(`https://generativelanguage.googleapis.com/v1/${fileName}?key=${GEMINI_API_KEY}`);
      const statusData = await statusRes.json();
      fileState = statusData.state;
      attempts++;
      console.log(`[Gemini] File state: ${fileState} (attempt ${attempts})`);
    }
    if (fileState !== 'ACTIVE') throw new Error(`File processing timed out (state: ${fileState}).`);

    // ── Step 3: Call Gemini 1.5 Flash with the file ───────────────────────
    const prompt = `You are analyzing a cooking tutorial video. Watch it carefully from start to finish.

Your job: identify distinct cooking steps and return precise loop timestamps.
A "loop stop" is a key moment a learner would replay to practice — e.g. dicing, folding, stirring.

Return this exact JSON structure:
{
  "title": "short recipe title (3-6 words)",
  "ingredients": ["ingredient 1", "ingredient 2", ...],
  "steps": ["step 1 description", "step 2 description", ...],
  "loops": [
    { "start": 0, "end": 15, "label": "Prep the onions" },
    ...
  ]
}

Rules:
- Return 3 to 12 loops based on how many distinct steps exist
- Loop labels must be action phrases (2-5 words): "Dice the onions", "Fold in egg whites"
- Timestamps in whole seconds, accurate to what you see
- If no speech — use visuals only
- Return ONLY valid JSON, no markdown, no explanation`;

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { fileData: { mimeType, fileUri } },
            ],
          }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );

    if (!gemRes.ok) {
      const errText = await gemRes.text();
      throw new Error(`Gemini generateContent failed (${gemRes.status}): ${errText.slice(0, 300)}`);
    }

    const gemData = await gemRes.json();
    let raw = gemData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    // Strip markdown code fences if present
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    if (!raw) throw new Error('Gemini returned an empty response.');

    const result = JSON.parse(raw);
    console.log(`[Gemini] ✅ ${result.loops?.length || 0} loops detected for "${result.title}"`);

    // Cleanup the file from Google (fire and forget)
    fetch(`https://generativelanguage.googleapis.com/v1/${fileName}?key=${GEMINI_API_KEY}`, { method: 'DELETE' }).catch(() => {});

    res.json({
      ok:          true,
      source:      'gemini',
      title:       result.title       || '',
      ingredients: result.ingredients || [],
      steps:       result.steps       || [],
      loops:       result.loops       || [],
    });

  } catch (err) {
    console.error('[Gemini] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Alias kept for any old callers
app.post('/api/ai/gemini-loops', (req, res) => res.status(410).json({ error: 'Deprecated — use /api/ai/gemini-analyze.' }));


// ─── AI: Translate steps + ingredients into target language ───────────────
app.post('/api/ai/translate', async (req, res) => {
  if (!openai) return res.status(500).json({ error: 'OpenAI not configured.' });
  const { recipe_id, language, steps, ingredients } = req.body;
  if (!steps || !language) return res.status(400).json({ error: 'Missing steps or language.' });

  const LANG_NAMES = {
    es: 'Spanish', fr: 'French', zh: 'Mandarin Chinese', ja: 'Japanese',
    pt: 'Brazilian Portuguese', de: 'German', ar: 'Arabic', hi: 'Hindi',
  };
  const langName = LANG_NAMES[language] || language;

  try {
    const stepsText = Array.isArray(steps) ? steps.join('\n') : steps;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are a cooking recipe translator. Translate cooking step labels and ingredients into ${langName}. Keep translations concise (step labels max 5 words). Return JSON: { "steps": ["...", ...], "ingredients": "..." }`,
        },
        {
          role: 'user',
          content: `Translate to ${langName}:\n\nSteps:\n${stepsText}\n\nIngredients:\n${ingredients || ''}`,
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 600,
      temperature: 0.1,
    });

    const result = JSON.parse(completion.choices[0].message.content);

    // Cache in Supabase if recipe_id provided
    // Uses SUPABASE_URL + SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) from env
    // @supabase/supabase-js is already a project dependency
    if (recipe_id) {
      try {
        const { createClient } = require('@supabase/supabase-js');
        const sb = createClient(
          process.env.SUPABASE_URL || '',
          process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
        );
        await sb.from('recipe_translations').upsert({
          recipe_id,
          language,
          steps:       result.steps || [],
          ingredients: result.ingredients || '',
        }, { onConflict: 'recipe_id,language' });
      } catch (cacheErr) {
        console.warn('[Translate] Cache save failed (table may not exist):', cacheErr.message);
      }
    }

    res.json({ steps: result.steps || [], ingredients: result.ingredients || '' });
  } catch (err) {
    console.error('[AI Translate] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});


// ─── Status: which AI services are configured ──────────────────────────────
app.get('/api/ai/status', (req, res) => {
  res.json({
    gemini:  !!GEMINI_API_KEY,
    whisper: !!OPENAI_API_KEY,
    cf:      !!CF_ACCOUNT_ID && !!CF_API_TOKEN,
  });
});

// ─── Serve SPA (must be LAST) ──────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
  console.log(`   Cloudflare Stream: ${CF_ACCOUNT_ID ? '✅' : '❌ not configured'}`);
  console.log(`   OpenAI / Whisper:  ${OPENAI_API_KEY ? '✅' : '❌ not configured'}`);
  console.log(`   Gemini:            ${GEMINI_API_KEY ? '✅ key starts with ' + GEMINI_API_KEY.slice(0,6) + '...' : '❌ GEMINI_API_KEY not set'}`);
});
