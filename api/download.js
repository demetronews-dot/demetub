module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://demetub.blogspot.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  const { url, format, quality } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL ausente' });

  const rapidApiKey = process.env.RAPIDAPI_KEY;
  const rapidApiHost = 'youtube-media-downloader.p.rapidapi.com';

  if (!rapidApiKey) {
    return res.status(500).json({ error: 'API key nao configurada.' });
  }

  function sanitizeFilename(name) {
    return (name || 'video')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
  }

  try {
    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) {
      return res.status(400).json({ error: 'Video ID invalido.' });
    }
    const videoId = match[1];

    const apiUrl = 'https://' + rapidApiHost + '/v2/video/details' +
      '?audios=auto&videos=auto&urlAccess=proxy&subtitles=false&related=false' +
      '&videoId=' + videoId;

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': rapidApiHost,
        'x-rapidapi-key': rapidApiKey
      }
    });

    const apiData = await apiResponse.json();

    if (apiData.errorId !== 'Success') {
      return res.status(500).json({
        error: apiData.errorId || 'Erro na API'
      });
    }

    let downloadUrl = null;
    let selectedInfo = null;

    if (format === 'mp3') {
      if (apiData.audios && apiData.audios.items && apiData.audios.items.length > 0) {
        const audio = apiData.audios.items[0];
        downloadUrl = audio.url;
        selectedInfo = { ext: audio.extension, size: audio.sizeText };
      }
    } else {
      if (apiData.videos && apiData.videos.items && apiData.videos.items.length > 0) {
        const videos = apiData.videos.items;
        const targetQuality = (quality || '720p').replace('p', '');

        let selected = videos.find(v =>
          v.hasAudio === true &&
          v.quality &&
          v.quality === quality
        );

        if (!selected) {
          selected = videos.find(v =>
            v.hasAudio === true &&
            v.extension === 'mp4'
          );
        }

        if (!selected) {
          selected = videos.find(v =>
            v.quality === quality &&
            v.extension === 'mp4'
          );
        }

        if (!selected) {
          selected = videos.find(v => v.extension === 'mp4');
        }

        if (!selected) {
          selected = videos[0];
        }

        downloadUrl = selected.url;
        selectedInfo = {
          quality: selected.quality,
          ext: selected.extension,
          hasAudio: selected.hasAudio,
          size: selected.sizeText
        };
      }
    }

    if (!downloadUrl) {
      return res.status(500).json({ error: 'Nenhum formato disponivel.' });
    }

    const ext = (format === 'mp3') ? 'mp3' : 'mp4';
    const safeTitle = sanitizeFilename(apiData.title);
    const fileName = safeTitle + '.' + ext;

    return res.status(200).json({
      download_url: downloadUrl,
      title: apiData.title || 'Video',
      filename: fileName,
      duration: apiData.lengthSeconds || null,
      uploader: apiData.channel ? apiData.channel.name : null,
      info: selectedInfo
    });

  } catch (err) {
    console.error('Erro:', err);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
};Corrige urlAccess para proxy e filename
