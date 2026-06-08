const fetch = require('node-fetch');

async function testEndpoint() {
  try {
    const res = await fetch('http://localhost:8000/api/ai/youtube-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: '6uSMDuHJTmo' })
    });
    
    console.log('Status:', res.status);
    const data = await res.json();
    console.log('Response data:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testEndpoint();
