const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://demetub.blogspot.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };

  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders);
    return res.end(JSON.stringify({ error: 'Método não permitido' }));
  }

  const { url, format, quality } = req.body || {};

  if (!url || !format || !quality) {
    res.writeHead(400, corsHeaders);
    return res.end(JSON.stringify({ error: 'Parâmetros ausentes: url, format, quality.' }));
  }

  try {
    const options = {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    };

    if (process.env.YOUTUBE_COOKIES) {
      const cookiePath = path.join('/tmp', 'cookies.txt');
      const cookieLines = ['# Netscape HTTP Cookie File', ''];
      process.env.YOUTUBE_COOKIES.split(';').forEach(pair => {
        const trimmed = pair.trim();
        if (trimmed) {
          const [name, ...valueParts] = trimmed.split('=');
          const value = valueParts.join('=');
          if (name && value) {
            cookieLines.push(`.youtube.com\tTRUE\t/\tFALSE\t0\t${name}\t${value}`);
          }
        }
      });
      fs.writeFileSync(cookiePath, cookieLines.join('\n'));
      options.cookies = cookiePath;
    }

    if (process.env.YT_DLP_PROXY) {
      options.proxy = process.env.YT_DLP_PROXY;
    }

    if (format === 'mp3') {
      options.format = 'bestaudio/best';
    } else {
      const height = quality.replace('p', '');
      options.format = `best[height<=${height}][ext=mp4]/best[height<=${height}]/best`;
    }

    const output = await youtubedl(url, options);

    let downloadUrl = output.url;
    if (!downloadUrl && output.formats && output.formats.length > 0) {
      const best = output.formats
        .filter(f => f.url && f.ext === 'mp4' && f.acodec !== 'none' && f.vcodec !== 'none')
        .pop() || output.formats.filter(f => f.url).pop();
      if (best) downloadUrl = best.url;
    }

    if (!downloadUrl) {
      throw new Error('Não foi possível extrair a URL de download.');
    }

    res.writeHead(200, corsHeaders);
    return res.end(JSON.stringify({
      download_url: downloadUrl,
      title: output.title || 'Vídeo',
      duration: output.duration || null,
      uploader: output.uploader || null
    }));

  } catch (error) {
    console.error('Erro no yt-dlp:', error);

    let errorMessage = 'Falha ao processar o vídeo.';
    const errStr = (error.stderr || error.message || '').toString();

    if (errStr.includes('Sign in to confirm')) {
      errorMessage = 'O YouTube bloqueou a requisição. Cookies ou proxy precisam ser configurados.';
    } else if (errStr.includes('not found') || errStr.includes('command not found')) {
      errorMessage = 'Ferramenta de download não instalada no servidor.';
    }

    res.writeHead(500, corsHeaders);
    return res.end(JSON.stringify({ error: errorMessage }));
  }
};
