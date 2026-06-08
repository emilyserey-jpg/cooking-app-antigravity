const { YoutubeTranscript } = require('youtube-transcript');

async function testLib() {
  try {
    console.log('Fetching transcript for dQw4w9WgXcQ...');
    const transcript = await YoutubeTranscript.fetchTranscript('dQw4w9WgXcQ');
    console.log('Success! Transcript length:', transcript.length);
    console.log('Sample text:', transcript.slice(0, 5));
  } catch (err) {
    console.error('Library failed:', err.message);
  }
}

testLib();
