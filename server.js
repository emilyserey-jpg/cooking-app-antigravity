const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 8000;

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const CF_API_TOKEN  = process.env.CF_API_TOKEN;

app.use(express.json());

// ─── Serve static frontend files ───────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─── API: Get a Cloudflare Stream direct upload URL ────────────────────────
// The browser calls this, gets back a one-time upload URL + video UID.
// Your secret CF_API_TOKEN never leaves this server.
app.post('/api/cf-upload-url', async (req, res) => {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    return res.status(500).json({
      error: 'Cloudflare Stream is not configured on this server. Add CF_ACCOUNT_ID and CF_API_TOKEN environment variables.'
    });
  }

  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds: 3600,   // 1 hour max video length
          requireSignedURLs: false,   // public videos for now
        }),
      }
    );

    const data = await response.json();

    if (!data.success) {
      const msg = data.errors?.[0]?.message || 'Cloudflare API error';
      console.error('[CF Stream] Error:', msg, data.errors);
      return res.status(400).json({ error: msg });
    }

    // Return the upload URL and video UID to the browser
    res.json({
      uploadURL: data.result.uploadURL,
      uid:       data.result.uid,
    });

  } catch (err) {
    console.error('[CF Stream] Server error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── API: Check if a video is ready to stream ──────────────────────────────
app.get('/api/cf-video-status/:uid', async (req, res) => {
  if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
    return res.status(500).json({ error: 'Not configured' });
  }
  try {
    const response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/stream/${req.params.uid}`,
      { headers: { 'Authorization': `Bearer ${CF_API_TOKEN}` } }
    );
    const data = await response.json();
    if (!data.success) return res.status(400).json({ error: 'Not found' });

    res.json({
      uid:        data.result.uid,
      status:     data.result.status?.state,   // 'ready' | 'inprogress' | 'pendingupload'
      duration:   data.result.duration,
      thumbnail:  data.result.thumbnail,
      playbackUrl:`https://videodelivery.net/${data.result.uid}/manifest/video.m3u8`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Fallback — serve index.html for all unknown routes ───────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   CF Stream: ${CF_ACCOUNT_ID ? '✅ configured' : '❌ not configured'}`);
});
