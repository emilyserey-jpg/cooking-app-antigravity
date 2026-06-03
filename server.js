const express = require('express');
const multer  = require('multer');
const path    = require('path');
const OpenAI  = require('openai');

const app  = express();
const PORT = process.env.PORT || 8000;

const CF_ACCOUNT_ID  = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN   = process.env.CF_API_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// OpenAI client (only created if key exists)
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Multer: keep uploaded files in memory (max 25MB — Whisper's limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
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

// ─── Serve SPA ────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
  console.log(`   Cloudflare Stream: ${CF_ACCOUNT_ID ? '✅' : '❌ not configured'}`);
  console.log(`   OpenAI / Whisper:  ${OPENAI_API_KEY ? '✅' : '❌ not configured'}`);
});
