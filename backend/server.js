const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());
app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) fs.mkdirSync(downloadsDir);

function detectPlatform(url) {
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('instagram.com')) return 'Instagram';
  if (url.includes('twitter.com') || url.includes('x.com')) return 'Twitter/X';
  if (url.includes('tiktok.com')) return 'TikTok';
  if (url.includes('facebook.com') || url.includes('fb.watch')) return 'Facebook';
  if (url.includes('vimeo.com')) return 'Vimeo';
  if (url.includes('reddit.com')) return 'Reddit';
  return 'Unknown';
}

function formatDuration(seconds) {
  if (!seconds) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

// GET /api/info
app.get('/api/info', (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const platform = detectPlatform(url);
  const cmd = `yt-dlp --dump-json --no-playlist "${url}"`;

  exec(cmd, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(400).json({
        error: 'Could not fetch video info.',
        hint: 'Ensure yt-dlp is installed: pip install yt-dlp',
        details: stderr.slice(0, 300),
      });
    }

    try {
      const info = JSON.parse(stdout);

      // Only MP4 video formats, deduplicated by height, sorted best first
      const seenHeights = new Set();
      const formats = (info.formats || [])
        .filter(f => f.ext === 'mp4' && f.height && f.vcodec && f.vcodec !== 'none')
        .sort((a, b) => b.height - a.height)
        .filter(f => {
          if (seenHeights.has(f.height)) return false;
          seenHeights.add(f.height);
          return true;
        })
        .map(f => ({
          format_id: f.format_id,
          ext: 'mp4',
          height: f.height,
          filesize: f.filesize || null,
          label: `${f.height}p · MP4`,
          type: 'video',
        }));

      res.json({
        title: info.title,
        thumbnail: info.thumbnail,
        duration: formatDuration(info.duration),
        duration_seconds: info.duration,
        uploader: info.uploader || info.channel,
        view_count: info.view_count,
        platform,
        formats,
      });
    } catch (e) {
      res.status(500).json({ error: 'Failed to parse video info' });
    }
  });
});

// POST /api/download
app.post('/api/download', (req, res) => {
  const { url, format_id, audioOnly } = req.body;
  if (!url) return res.status(400).json({ error: 'URL is required' });

  const ts = Date.now();
  const filename = `dl_${ts}.%(ext)s`;
  const outputPath = path.join(downloadsDir, filename);

  let formatFlag = '';
  if (audioOnly) {
    formatFlag = '-x --audio-format mp3';
  } else if (format_id) {
    // Merge selected video with best audio into mp4
    formatFlag = `-f "${format_id}+bestaudio[ext=m4a]/${format_id}" --merge-output-format mp4`;
  } else {
    formatFlag = '-f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4';
  }

  const cmd = `yt-dlp ${formatFlag} -o "${outputPath}" --no-playlist "${url}"`;

  exec(cmd, { timeout: 180000 }, (err, stdout, stderr) => {
    if (err) {
      return res.status(400).json({
        error: 'Download failed.',
        details: stderr.slice(0, 300),
      });
    }

    const files = fs.readdirSync(downloadsDir).filter(f => f.startsWith(`dl_${ts}`));
    if (files.length === 0) {
      return res.status(500).json({ error: 'Output file not found after download' });
    }

    const finalFile = files[0];
    const stat = fs.statSync(path.join(downloadsDir, finalFile));
    res.json({
      success: true,
      filename: finalFile,
      filesize: stat.size,
      downloadUrl: `/downloads/${finalFile}`,
    });
  });
});

app.get('/api/health', (req, res) => res.json({ status: 'ok', port: PORT }));

app.listen(PORT, () => {
  console.log(`✅  API running at http://localhost:${PORT}`);
  console.log(`📁  Downloads folder: ${downloadsDir}`);
});