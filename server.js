require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const OpenAI  = require('openai');
const replicate = require('./replicate-client');

const app  = express();
const PORT = process.env.PORT || 8000;

const CF_ACCOUNT_ID   = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN    = process.env.CF_API_TOKEN;
const OPENAI_API_KEY  = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY  = process.env.GEMINI_API_KEY;

// OpenAI client (only created if key exists)
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

// Helper to sanitize mime type and prevent 'application/octet-stream' errors
function getValidMimeType(file) {
  let mimeType = file.mimetype || 'video/mp4';
  if (mimeType === 'application/octet-stream' || !mimeType.startsWith('video/')) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (ext === '.mp4') mimeType = 'video/mp4';
    else if (ext === '.mov') mimeType = 'video/quicktime';
    else if (ext === '.webm') mimeType = 'video/webm';
    else if (ext === '.avi') mimeType = 'video/x-msvideo';
    else if (ext === '.mpeg' || ext === '.mpg') mimeType = 'video/mpeg';
    else if (ext === '.3gp') mimeType = 'video/3gpp';
    else if (ext === '.ogg') mimeType = 'video/ogg';
    else mimeType = 'video/mp4'; // Default fallback
  }
  return mimeType;
}

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
      { type: getValidMimeType(req.file) }
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

// Helper function for Chat Completion with Gemini fallback
async function getChatCompletion({ systemPrompt, userPrompt, jsonMode = false }) {
  const isPlaceholder = !OPENAI_API_KEY || OPENAI_API_KEY.includes('PASTE_YOUR');
  if (openai && !isPlaceholder) {
    try {
      const responseFormat = jsonMode ? { type: 'json_object' } : undefined;
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: responseFormat,
        temperature: 0.3
      });
      return completion.choices[0].message.content.trim();
    } catch (err) {
      console.warn('[OpenAI Chat] Failed, falling back to Gemini:', err.message);
    }
  }

  // Fallback to Gemini
  if (!GEMINI_API_KEY) {
    throw new Error('Neither OpenAI nor Gemini API keys are configured.');
  }

  const prompt = `${systemPrompt}\n\nUser input/data:\n${userPrompt}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: jsonMode ? "application/json" : "text/plain"
      }
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini Chat fallback failed (${response.status}): ${errText}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim();
}

function cleanAndParseJSON(str) {
  let cleaned = str.replace(/```json/gi, '').replace(/```/gi, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn('[JSON Parser] Standard parse failed, attempting regex fixes...', e.message);
    try {
      let fixed = cleaned
        .replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, '"$1"')
        .replace(/,\s*([\]}])/g, '$1')
        .replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
      return JSON.parse(fixed);
    } catch (e2) {
      console.error('[JSON Parser] All parsing attempts failed. Raw string:', cleaned);
      throw new Error(`Failed to parse AI JSON response: ${e2.message}`);
    }
  }
}


// ─── AI: Write ingredients from transcript ─────────────────────────────────
app.post('/api/ai/ingredients', async (req, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: 'No transcript.' });

  try {
    const content = await getChatCompletion({
      systemPrompt: 'You are a recipe assistant. Extract a clean, formatted ingredients list from a cooking video transcript. List one ingredient per line with quantity and unit (e.g. "2 cups all-purpose flour"). Only list ingredients clearly mentioned. Be concise.',
      userPrompt: `Extract ingredients from this transcript:\n\n${transcript}`
    });
    res.json({ ingredients: content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI: Write step-by-step instructions from transcript ───────────────────
app.post('/api/ai/steps', async (req, res) => {
  const { transcript } = req.body;
  if (!transcript) return res.status(400).json({ error: 'No transcript.' });

  try {
    const content = await getChatCompletion({
      systemPrompt: 'You are a recipe writer. Convert a cooking video transcript into clear, numbered step-by-step instructions. Each step must represent one distinct action. You MUST include all ingredient measurements (such as cups, tablespoons, teaspoons, grams, ounces, counts, etc.) mentioned in the transcript for each step. Write in the second person (e.g. "Add 4 cups of spinach..."). Be clear, descriptive, and concise. Maximum 10 steps.',
      userPrompt: `Write step-by-step instructions from this transcript:\n\n${transcript}`
    });
    res.json({ steps: content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI: Auto-detect loop points (start + end) from transcript ────────────
app.post('/api/ai/loops', async (req, res) => {
  const { transcript, segments, prompt } = req.body;
  if (!transcript) return res.status(400).json({ error: 'No transcript.' });

  const segmentText = (segments && segments.length > 0)
    ? segments.map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text.trim()}`).join('\n')
    : transcript;

  let userPromptText = `Identify cooking step loop boundaries:\n\n${segmentText}`;
  if (prompt && prompt.trim()) {
    userPromptText += `\n\nApply these customization tweaks requested by the user:\n"${prompt.trim()}"`;
  }

  try {
    const content = await getChatCompletion({
      systemPrompt: `You are a cooking video loop editor. Given timestamped transcript segments, identify distinct cooking steps and for each one, determine:
1. "time" — when the step STARTS (seconds, number)
2. "endTime" — when the loop should STOP and jump back to "time" (seconds, number). This is the last moment of that action before the next step begins.
3. "label" — short action name, max 4 words

Return JSON: { "steps": [ { "time": 5.2, "endTime": 18.7, "label": "Chop onions" }, ... ] }

Rules:
- endTime must always be AFTER time (endTime > time)
- Each step's endTime should be just before the next action starts
- The final step's endTime should be near the end of that action, not the end of the whole video
- Minimum 2 steps, maximum 12 steps
- Each step should represent a meaningful, distinct cooking action that is useful to loop/repeat. Avoid creating separate steps for trivial micro-actions like opening packaging, unpacking, or turning on burners. Merge them into the adjacent cooking/prep actions.
- Do NOT create separate steps specifically for waiting, resting, simmering, or baking durations (e.g. do not create a step for "Let simmer for 10 minutes"). Instead, merge these timing durations into the active cooking action that initiated them (e.g. "Simmer the sauce").
- Each step must have a minimum duration of at least 3 seconds. Do not create 1-second or 2-second steps.
- Look for transitions: "now", "next", "then", "add", "place", "stir", "cook", "remove"
- Labels should be action verbs ("Chop onions", "Add flour", "Stir mixture")`,
      userPrompt: userPromptText,
      jsonMode: true
    });
    
    const result = cleanAndParseJSON(content);
    res.json({ loops: Array.isArray(result.steps) ? result.steps : [] });
  } catch (err) {
    console.error('[AI Loops] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── AI: Gemini video analysis (Google File API → Gemini 2.0 Flash) ──────────
app.post('/api/ai/gemini-analyze', geminiUpload.single('video'), async (req, res) => {
  const { prompt: tweakPrompt } = req.body;
  if (!GEMINI_API_KEY)
    return res.status(503).json({ error: 'GEMINI_API_KEY not set in Railway variables.' });
  if (!req.file)
    return res.status(400).json({ error: 'No video file received.' });

  const mimeType = getValidMimeType(req.file);
  // Auth header works with both AIzaSy and AQ. key formats
  const authHeader = { 'x-goog-api-key': GEMINI_API_KEY };
  console.log(`[Gemini] File: ${req.file.originalname}, ${(req.file.size/1024/1024).toFixed(1)}MB, MIME: ${mimeType}`);

  try {
    // ── Step 1: Upload to Google File API ───────────────────────────────
    console.log('[Gemini] Uploading to File API...');
    const uploadRes = await fetch(
      `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
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
      throw new Error(`File API upload failed (${uploadRes.status}): ${errText.slice(0, 400)}`);
    }
    const uploadData = await uploadRes.json();
    const fileUri    = uploadData.file?.uri;
    const fileName   = uploadData.file?.name;
    if (!fileUri) throw new Error('File API returned no URI — check key permissions.');
    console.log(`[Gemini] Uploaded: ${fileUri}`);

    // ── Step 2: Wait for ACTIVE state ──────────────────────────────────
    let fileState = uploadData.file?.state || 'PROCESSING';
    let attempts  = 0;
    while (fileState === 'PROCESSING' && attempts < 30) {
      await new Promise(r => setTimeout(r, 3000));
      const s = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`
      );
      fileState = (await s.json()).state;
      attempts++;
      console.log(`[Gemini] State: ${fileState} (${attempts})`);
    }
    if (fileState !== 'ACTIVE') throw new Error(`File stuck in state: ${fileState}`);

    // ── Step 3: Generate content ────────────────────────────────────────
    let prompt = `Watch this cooking tutorial video from start to finish.
Identify distinct cooking steps and return ONLY this JSON (no markdown):
{
  "title": "short recipe name",
  "ingredients": ["quantity/unit ingredient name", "e.g. 4 cups fresh spinach", "1 block feta cheese"],
  "loops": [{ 
    "start": 0, 
    "end": 15, 
    "label": "Action phrase",
    "instruction": "detailed step instruction describing the action that happens during or immediately surrounding this start/end window (including prepped ingredients like pork belly). Make sure no ingredients or actions mentioned are left out.",
    "ingredients": ["all ingredients prepped, cut, or added during or near this time range (e.g. pork belly, onion)"]
  }],
  "text_overlays": [{ "start": 0.0, "end": 5.0, "text": "transcribed speech or narration text during this timeframe" }]
}
Rules:
- 3-12 loops, labels are 2-5 word action phrases, timestamps in whole seconds.
- Each loop must represent a meaningful, distinct cooking step that is useful to loop/repeat (e.g. chopping vegetables, seasoning, cooking pork, plating).
- Avoid creating loop stops for trivial, brief micro-actions (such as unpacking ingredients, opening lids, or turning on burners). Merge these trivial prep actions into the main adjacent step (e.g. merge "unpacking pork" into "seasoning pork" or "cooking pork").
- Do NOT create separate loops specifically for waiting, resting, simmering, or baking durations (e.g. do not create a loop stop for "Wait 10 minutes" or "Bake for 30 minutes"). Instead, merge these idle/waiting times into the active cooking action that initiated them (e.g. "Simmer the sauce").
- Do NOT leave out any ingredients or actions that are mentioned in the transcript or shown in the video slightly outside the step's timestamps (e.g. if pork is prepped at 0:06 but the step is 0:03-0:06, include it in that step). Nothing must be left out!
- Minimum duration for any loop is 3 seconds. Never output 1-second or 2-second steps.
- Ensure the instruction and ingredients list for each loop contains the exact measurements mentioned in the speech or shown in the video.
- Be chronological: each loop's instruction should describe the actions during and immediately surrounding its start/end window.
- Provide detailed timestamped speech transcripts/subtitles in text_overlays matching the video timeline.`;

    if (tweakPrompt && tweakPrompt.trim()) {
      prompt += `\n\nApply these customization tweaks requested by the user:\n"${tweakPrompt.trim()}"`;
    }

    const gemRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { fileData: { mimeType, fileUri } }] }],
          generationConfig: { temperature: 0.2 },
        }),
      }
    );
    if (!gemRes.ok) {
      const errText = await gemRes.text();
      throw new Error(`Gemini failed (${gemRes.status}): ${errText.slice(0, 400)}`);
    }
    const gemData = await gemRes.json();
    let raw = gemData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
    if (!raw) throw new Error('Gemini returned empty response.');
    const result = JSON.parse(raw);
    console.log(`[Gemini] ✅ ${result.loops?.length} loops — "${result.title}"`);

    // Cleanup (fire and forget)
    fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`,
      { method: 'DELETE' }).catch(() => {});

    res.json({ ok: true, source: 'gemini',
      title: result.title || '', ingredients: result.ingredients || [],
      steps: result.steps || [], loops: result.loops || [],
      text_overlays: result.text_overlays || [] });

  } catch (err) {
    console.error('[Gemini]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Alias kept for any old callers
app.post('/api/ai/gemini-loops', (req, res) => res.status(410).json({ error: 'Deprecated — use /api/ai/gemini-analyze.' }));


// ─── AI: Write a description for each loop stop ───────────────────────────
app.post('/api/ai/describe-steps', async (req, res) => {
  const { steps, segments } = req.body;
  if (!steps || !steps.length) return res.status(400).json({ error: 'No steps provided.' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Gemini API key not configured.' });

  const stepList = steps.map((s, i) => {
    const stepStart = s.startTime || 0;
    const stepEnd = s.endTime || (stepStart + 5);

    // Correlate with matching subtitles segments (using a broader overlap check to avoid leaving out nearby actions)
    let matchingText = '';
    if (Array.isArray(segments)) {
      matchingText = segments
        .filter(seg => {
          const segStart = Number(seg.start ?? seg.startTime ?? seg.start_time) || 0;
          const segEnd = Number(seg.end ?? seg.endTime ?? seg.end_time) || (segStart + 5);
          // Check if segment overlaps with the step time window (with a broader 2.5s padding/tolerance to capture trailing speech)
          return (segStart <= stepEnd + 2.5) && (segEnd >= stepStart - 2.5);
        })
        .map(seg => seg.text)
        .join(' ');
    }

    return `Step ${i + 1}: "${s.label}" (${formatTime(stepStart)} → ${formatTime(stepEnd)})
Spoken/subtitled text during this timeframe: "${matchingText || 'No direct transcription'}"`;
  }).join('\n\n');

  const prompt = `You are writing concise cooking instructions for a recipe video editor.
The video has been divided into ${steps.length} loop stop sections:

${stepList}

For each step, write a clear, action-oriented instruction describing the specific action that happens during that step's time range, and list the ingredients that are added or prepared.
Do NOT leave out any ingredients or actions (such as prepping, cutting, or adding items) mentioned in the speech/transcript immediately surrounding the time window. Make sure nothing is left out!
IMPORTANT: You MUST include the exact ingredient measurements (e.g. 4 cups, 2 teaspoons, grams, etc.) mentioned in the spoken/subtitled text. Do not omit the quantities!
Format each step description exactly as: "[Instruction details]. Ingredients: [list of ingredients and their exact quantities used, or 'None' if no ingredients are added in this step]". Keep it concise and practical.
Reply ONLY with a JSON array of strings, one description per step, in order. Example:
["Heat the pan on medium-high. Ingredients: 2 tablespoons cooking oil.", "Season the shrimp in a bowl. Ingredients: 1 pound shrimp, 1 teaspoon salt, 1/2 teaspoon black pepper, 1/2 teaspoon garlic powder."]`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let descriptions = [];
    try {
      descriptions = cleanAndParseJSON(text);
    } catch (parseErr) {
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array found in response: ' + text);
      descriptions = cleanAndParseJSON(match[0]);
    }
    res.json({ descriptions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Replicate: Transcribe video from public URL ─────────────────────────
app.post('/api/ai/replicate-transcribe', async (req, res) => {
  if (!replicate) return res.status(500).json({ error: 'Replicate API not configured. Check REPLICATE_API_TOKEN.' });
  const { videoUrl } = req.body;
  if (!videoUrl) return res.status(400).json({ error: 'No videoUrl provided.' });

  try {
    console.log('[Replicate] Starting transcription for:', videoUrl);
    const output = await replicate.run(
      "openai/whisper:4d507922b92f1b9649292dbbbd030999ee45f1b53f1d3e8e2b10cfb7f2a1599d",
      {
        input: {
          audio: videoUrl,
          model: "large-v3",
          translate: false,
          temperature: 0,
          transcription: "plain text",
          response_format: "json",
          timestamp: "chunk"
        }
      }
    );

    if (!output || !output.transcription) {
      throw new Error('Replicate Whisper did not return transcription data.');
    }

    // Map segments to our app's format (start, end, text)
    const rawSegments = output.segments || [];
    const segments = rawSegments.map((seg, idx) => ({
      id: seg.id ?? idx,
      start: seg.start,
      end: seg.end,
      text: seg.text || ''
    }));

    res.json({
      ok: true,
      transcript: output.transcription,
      segments
    });
  } catch (err) {
    console.error('[Replicate Transcribe Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Replicate: Generate Cover Image from prompt ─────────────────────────
app.post('/api/ai/generate-cover', async (req, res) => {
  if (!replicate) return res.status(500).json({ error: 'Replicate API not configured. Check REPLICATE_API_TOKEN.' });
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: 'No prompt provided.' });

  try {
    console.log('[Replicate] Generating cover image for:', prompt);
    const output = await replicate.run(
      "black-forest-labs/flux-schnell",
      {
        input: {
          prompt: `High-end gourmet food photography of: ${prompt}, professional presentation, beautiful plating, studio light, top-down view, 4k resolution`,
          aspect_ratio: "1:1",
          disable_safety_checker: true
        }
      }
    );

    const tempUrl = Array.isArray(output) ? output[0] : output;
    if (!tempUrl) throw new Error('No image URL returned from Replicate.');

    // Download image buffer
    const imgRes = await fetch(tempUrl);
    if (!imgRes.ok) throw new Error(`Failed to download image from Replicate CDN: ${imgRes.statusText}`);
    const buffer = Buffer.from(await imgRes.arrayBuffer());

    // Upload to Supabase Storage permanently
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
    );
    const ext = 'jpg';
    const fname = `thumbnails/ai_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error: uploadError } = await sb.storage.from('videos').upload(fname, buffer, {
      contentType: 'image/jpeg',
      upsert: true
    });
    if (uploadError) throw uploadError;

    const { data: urlData } = sb.storage.from('videos').getPublicUrl(fname);
    res.json({ ok: true, imageUrl: urlData.publicUrl });
  } catch (err) {
    console.error('[Replicate Generate Cover Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Replicate: Generate Voiceover MP3 from text ─────────────────────────
app.post('/api/ai/generate-voiceover', async (req, res) => {
  if (!replicate) return res.status(500).json({ error: 'Replicate API not configured. Check REPLICATE_API_TOKEN.' });
  const { text, stepIndex, recipeId } = req.body;
  if (!text) return res.status(400).json({ error: 'No text provided.' });

  try {
    console.log(`[Replicate] Generating voiceover for step ${stepIndex || 0}:`, text);
    const output = await replicate.run(
      "lucataco/openai-tts:aac2a60c7d81a9ae938f4d96a798b3c9b7f525bf60d84a7e8006fb4284d72863",
      {
        input: {
          model: "tts-1",
          voice: "alloy",
          input: text,
          response_format: "mp3"
        }
      }
    );

    const tempUrl = Array.isArray(output) ? output[0] : output;
    if (!tempUrl) throw new Error('No audio URL returned from Replicate.');

    // Download audio buffer
    const audioRes = await fetch(tempUrl);
    if (!audioRes.ok) throw new Error(`Failed to download audio from Replicate CDN: ${audioRes.statusText}`);
    const buffer = Buffer.from(await audioRes.arrayBuffer());

    // Upload to Supabase Storage permanently
    const { createClient } = require('@supabase/supabase-js');
    const sb = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
    );
    const rFolder = (recipeId || 'temp_voiceovers').toString().replace(/[^a-zA-Z0-9_-]/g, '_');
    const fname = `voiceovers/${rFolder}/step_${stepIndex || 0}_${Date.now()}.mp3`;
    const { error: uploadError } = await sb.storage.from('videos').upload(fname, buffer, {
      contentType: 'audio/mpeg',
      upsert: true
    });
    if (uploadError) throw uploadError;

    const { data: urlData } = sb.storage.from('videos').getPublicUrl(fname);
    res.json({ ok: true, audioUrl: urlData.publicUrl });
  } catch (err) {
    console.error('[Replicate Generate Voiceover Error]:', err.message);
    res.status(500).json({ error: err.message });
  }
});

function formatTime(secs) {
  if (!secs && secs !== 0) return '?';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

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


// ─── AI: YouTube video transcript analysis ────────────────────────────────
app.post('/api/ai/youtube-analyze', async (req, res) => {
  const { videoId } = req.body;
  if (!videoId) return res.status(400).json({ error: 'No videoId provided.' });

  try {
    console.log(`[YouTube AI] Fetching transcript for video: ${videoId}`);
    const { YoutubeTranscript } = require('youtube-transcript');
    const rawTranscript = await YoutubeTranscript.fetchTranscript(videoId);
    if (!rawTranscript || rawTranscript.length === 0) {
      throw new Error('No transcript available for this YouTube video.');
    }

    // Map segments to Whisper-like format (start, end, text)
    const segments = rawTranscript.map((seg, idx) => ({
      id: idx,
      start: Number(seg.offset) / 1000,
      end: (Number(seg.offset) + Number(seg.duration)) / 1000,
      text: seg.text || ''
    }));

    const fullTranscriptText = rawTranscript.map(s => s.text).join(' ');

    console.log(`[YouTube AI] Transcribed — ${fullTranscriptText.length} chars, ${segments.length} segments`);

    // Now call Gemini to analyze the transcript and generate recipe structure (title, ingredients, loop steps)
    const prompt = `Watch this cooking tutorial video transcript with timed segments.
Identify distinct cooking steps and return ONLY this JSON (no markdown):
{
  "title": "short recipe name or video title",
  "ingredients": ["quantity/unit ingredient name", "e.g. 4 cups fresh spinach", "1 block feta cheese"],
  "loops": [{ 
    "start": 0, 
    "end": 15, 
    "label": "Action phrase",
    "instruction": "detailed step instruction describing the action that happens during or immediately surrounding this start/end window. Make sure no ingredients or actions mentioned are left out.",
    "ingredients": ["all ingredients prepped, cut, or added during or near this time range (e.g. pork belly, onion)"]
  }]
}
Rules:
- MUST COVER ENTIRE VIDEO: The steps (loops) MUST cover the entire duration of the video. The first step must start at or near 0, and the last step must end at the end of the video. Do not leave large gaps in the timeline. Bridge any silence, intros, transition screens, or music by extending the duration of the adjacent steps so that the entire timeline is mapped.
- MULTIPLE RECIPES / COMPILATIONS: If the video teaches multiple different recipes/meals (e.g., "5 Easy Korean Meals"), do NOT just extract one recipe or the final one. You must output steps for ALL of the recipes in the video in chronological order. Set the main "title" to the name of the video or compilation, combine all ingredients in the main "ingredients" list, and ensure the steps chronologically trace through all the dishes from the start of the video to the end of the video.
- 4-15 loops, labels are 2-5 word action phrases, timestamps in whole seconds.
- NO OVERLAPS: Steps must be contiguous and sequential (e.g. step N starts where step N-1 ends, or very close to it).
- Each loop must represent a meaningful, distinct cooking step that is useful to loop/repeat (e.g. chopping vegetables, seasoning, cooking pork, plating).
- Avoid creating loop stops for trivial, brief micro-actions. Merge these trivial prep actions into the main adjacent step.
- Do NOT create separate loops specifically for waiting, resting, simmering, or baking durations. Instead, merge these idle/waiting times into the active cooking action that initiated them.
- Minimum duration for any loop is 3 seconds. Never output 1-second or 2-second steps.
- Ensure the instruction and ingredients list for each loop contains the exact measurements mentioned in the transcript.
- Be chronological: each loop's instruction should describe the actions during and immediately surrounding its start/end window.`;

    const segmentText = segments.map(s => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text.trim()}`).join('\n');

    const content = await getChatCompletion({
      systemPrompt: prompt,
      userPrompt: `Identify cooking step loop boundaries from transcript:\n\n${segmentText}`,
      jsonMode: true
    });

    const result = cleanAndParseJSON(content);
    console.log(`[YouTube AI] ✅ Generated ${result.loops?.length} loops — "${result.title}"`);

    res.json({
      ok: true,
      title: result.title || '',
      ingredients: result.ingredients || [],
      loops: result.loops || [],
      segments: segments
    });

  } catch (err) {
    console.error('[YouTube AI Error]:', err.message);
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

async function initStorageBucket() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Supabase Storage] SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY not set. Skipping bucket initialization.');
    return;
  }

  try {
    const { createClient } = require('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false }
    });

    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    if (listError) throw listError;

    const hasVideos = buckets.some(b => b.name === 'videos');
    if (!hasVideos) {
      console.log('[Supabase Storage] Creating "videos" bucket...');
      const { error: createError } = await supabaseAdmin.storage.createBucket('videos', {
        public: true,
        allowedMimeTypes: ['video/*', 'image/*'],
        fileSizeLimit: 524288000 // 500MB
      });
      if (createError) throw createError;
      console.log('[Supabase Storage] "videos" bucket created successfully.');
    } else {
      console.log('[Supabase Storage] "videos" bucket already exists.');
    }
  } catch (err) {
    console.error('[Supabase Storage] Error initializing storage bucket:', err.message);
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Server on port ${PORT}`);
  console.log(`   Cloudflare Stream: ${CF_ACCOUNT_ID ? '✅' : '❌ not configured'}`);
  console.log(`   OpenAI / Whisper:  ${OPENAI_API_KEY ? '✅' : '❌ not configured'}`);
  console.log(`   Gemini:            ${GEMINI_API_KEY ? '✅ key starts with ' + GEMINI_API_KEY.slice(0,6) + '...' : '❌ GEMINI_API_KEY not set'}`);
  
  // Initialize storage bucket
  initStorageBucket();
});

