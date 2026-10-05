const youtubedl = require('youtube-dl-exec');
const fs = require('fs');
const path = require('path');

module.exports = async function handler(req, res) {
  // CORS para o Blogger
  res.setHeader('Access-Control-Allow-Origin', 'https://demetub.blogspot.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Responde ao preflight do navegador
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { url, format, quality } = req.body || {};

  if (!url || !format || !quality) {
    return res.status(400).json({ error: 'Parâmetros ausentes: url, format, quality.' });
  }

  try {
    // Opções base do yt-dlp
    const options = {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      addHeader: ['referer:youtube.com', 'user-agent:googlebot']
    };

    // Configura os cookies (se existirem)
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

    // Configura o proxy (se existir)
    if (process.env.YT_DLP_PROXY) {
      options.proxy = process.env.YT_DLP_PROXY;
    }

    // Define o formato
    if (format === 'mp3') {
      options.format = 'bestaudio/best';
    } else {
      const height = quality.replace('p', '');
      options.format = `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`;
    }

    // Executa o yt-dlp
    const output = await youtubedl(url, options);

    // Extrai a URL de download
    let downloadUrl = output.url;

    if (!downloadUrl && output.requested_downloads && output.requested_downloads.length > 0) {
      downloadUrl = output.requested_downloads[0].url;
    }

    if (!downloadUrl && output.formats && output.formats.length > 0) {
      const best = output.formats
        .filter(f => f.url && (f.vcodec !== 'none' || f.acodec !== 'none'))
        .pop();
      if (best) downloadUrl = best.url;
    }

    if (!downloadUrl) {
      throw new Error('Não foi possível extrair a URL de download.');
    }

    return res.status(200).json({
      download_url: downloadUrl,
      title: output.title || 'Vídeo',
      duration: output.duration || null,
      uploader: output.uploader || null
    });

  } catch (error) {
    console.error('Erro no yt-dlp:', error);

    let errorMessage = 'Falha ao processar o vídeo. Tente novamente.';
    const errStr = (error.stderr || error.message || '').toString();

    if (errStr.includes('Sign in to confirm')) {
      errorMessage = 'O YouTube bloqueou a requisição. Cookies ou proxy precisam ser configurados.';
    } else if (errStr.includes('not found') || errStr.includes('command not found')) {
      errorMessage = 'Ferramenta de download não instalada no servidor.';
    } else if (errStr.includes('ffmpeg')) {
      errorMessage = 'FFmpeg não disponível. Tente uma qualidade diferente.';
    }

    return res.status(500).json({ error: errorMessage });
  }
};
