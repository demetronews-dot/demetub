const youtubedl = require('youtube-dl-exec');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://demetub.blogspot.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metodo nao permitido' });
  }

  const url = (req.body && req.body.url) || '';
  const format = (req.body && req.body.format) || 'mp4';
  const quality = (req.body && req.body.quality) || '720p';

  if (!url) {
    return res.status(400).json({ error: 'URL ausente' });
  }

  try {
    const path = require('path');
    const binPath = path.join(process.cwd(), 'node_modules', 'youtube-dl-exec', 'bin', 'yt-dlp');

    const opts = {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      binaryPath: binPath
    };

    if (process.env.YT_DLP_PROXY) {
      opts.proxy = process.env.YT_DLP_PROXY;
    }

    if (format === 'mp3') {
      opts.format = 'bestaudio/best';
    } else {
      const h = quality.replace('p', '');
      opts.format = 'best[height<=' + h + '][ext=mp4]/best[height<=' + h + ']/best';
    }

    const output = await youtubedl(url, opts);

    let downloadUrl = output.url;
    if (!downloadUrl && output.formats && output.formats.length > 0) {
      const best = output.formats.filter(f => f.url).pop();
      if (best) downloadUrl = best.url;
    }

    if (!downloadUrl) {
      return res.status(500).json({ error: 'Nao foi possivel extrair URL' });
    }

    return res.status(200).json({
      download_url: downloadUrl,
      title: output.title || 'Video',
      duration: output.duration || null,
      uploader: output.uploader || null
    });

  } catch (err) {
    const msg = (err.stderr || err.message || '').toString();
    if (msg.indexOf('Sign in to confirm') !== -1) {
      return res.status(500).json({ error: 'YouTube bloqueou. Cookies ou proxy precisam ser configurados.' });
    }
    return res.status(500).json({ error: 'Falha: ' + msg.slice(0, 300) });
  }
};
