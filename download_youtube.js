
const fs = require('fs');
const path = require('path');

// Helper to extract video ID from YouTube URL
function getYouTubeId(url) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : url;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: node download_youtube.js <youtube_url_or_id>");
    process.exit(1);
  }

  const input = args[0];
  const videoId = getYouTubeId(input);
  console.log(`Initializing YouTube client...`);
  
  try {
    const { Innertube, Platform } = await import('youtubei.js');

    // Provide the code-runner to decrypt Youtube links: 
    Platform.shim.eval = async (data) => {
	return new Function(data.output)();
    };
    const youtube = await Innertube.create();
    console.log(`Fetching info for video ID: ${videoId}...`);
    
    const info = await youtube.getInfo(videoId, { client: 'ANDROID' });
    const title = info.basic_info.title || 'youtube_video';
    const safeTitle = title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const filename = `${safeTitle}.mp4`;
    const outputPath = path.join(__dirname, filename);

    console.log(`Downloading "${title}"...`);
    const stream = await info.download({
      type: 'video+audio',
      quality: 'best'
    });

    const fileStream = fs.createWriteStream(outputPath);
    
    let downloadedBytes = 0;
    console.log(`Writing to ${filename}...`);
    for await (const chunk of stream) {
      fileStream.write(chunk);
      downloadedBytes += chunk.length;
      process.stdout.write(`Downloaded ${(downloadedBytes / (1024 * 1024)).toFixed(2)} MB...\r`);
    }
    fileStream.end();
    
    console.log(`\n✅ Download complete! Saved to: ${outputPath}`);
  } catch (error) {
    console.error(`\n❌ Error downloading video:`, error.message);
  }
}

main();
