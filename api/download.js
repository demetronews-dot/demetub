module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://demetub.blogspot.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodo nao permitido' });

  // ===== DEBUG INICIAL =====
  const debug = {
    step: 'inicio',
    hasBody: !!req.body,
    bodyType: typeof req.body,
    hasUrl: false,
    hasKey: false,
    keyLength: 0,
    hasFetch: typeof fetch,
    errorAt: null
  };

  try {
    const { url, format, quality } = req.body || {};
    debug.hasUrl = !!url;
    debug.url = url || 'vazio';

    if (!url) {
      return res.status(400).json({ 
        error: 'URL ausente',
        debug: debug
      });
    }

    const rapidApiKey = process.env.RAPIDAPI_KEY;
    const rapidApiHost = 'youtube-media-downloader.p.rapidapi.com';

    debug.hasKey = !!rapidApiKey;
    debug.keyLength = rapidApiKey ? rapidApiKey.length : 0;

    if (!rapidApiKey) {
      return res.status(500).json({ 
        error: 'API key nao configurada',
        debug: debug
      });
    }

    debug.step = 'extrair_videoid';

    const match = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (!match) {
      return res.status(400).json({ 
        error: 'Video ID invalido',
        debug: debug
      });
    }
    const videoId = match[1];
    debug.videoId = videoId;

    debug.step = 'chamar_rapidapi';

    const apiUrl = 'https://' + rapidApiHost + '/v2/video/details' +
      '?audios=auto&videos=auto&urlAccess=proxy&subtitles=false&related=false' +
      '&videoId=' + videoId;

    debug.apiUrl = apiUrl;

    const apiResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'x-rapidapi-host': rapidApiHost,
        'x-rapidapi-key': rapidApiKey
      }
    });

    debug.step = 'resposta_rapidapi';
    debug.apiStatus = apiResponse.status;

    const apiText = await apiResponse.text();
    debug.apiTextLength = apiText.length;
    debug.apiTextStart = apiText.substring(0, 300);

    let apiData;
    try {
      apiData = JSON.parse(apiText);
    } catch (parseErr) {
      return res.status(500).json({
        error: 'Resposta nao e JSON',
        debug: debug,
        parseError: parseErr.message
      });
    }

    debug.errorId = apiData.errorId;

    if (apiData.errorId !== 'Success') {
      return res.status(500).json({
        error: 'RapidAPI: ' + (apiData.errorId || 'unknown'),
        apiResponse: apiData,
        debug: debug
      });
    }

    debug.step = 'processar_dados';

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
        let selected = videos.find(v => v.hasAudio === true && v.quality === quality);
        if (!selected) selected = videos.find(v => v.hasAudio === true && v.extension === 'mp4');
        if (!selected) selected = videos.find(v => v.quality === quality && v.extension === 'mp4');
        if (!selected) selected = videos.find(v => v.extension === 'mp4');
        if (!selected) selected = videos[0];

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
      return res.status(500).json({ 
        error: 'Nenhum formato disponivel',
        debug: debug,
        apiStructure: {
          hasVideos: !!(apiData.videos && apiData.videos.items),
          videosCount: apiData.videos && apiData.videos.items ? apiData.videos.items.length : 0,
          hasAudios: !!(apiData.audios && apiData.audios.items),
          audiosCount: apiData.audios && apiData.audios.items ? apiData.audios.items.length : 0
        }
      });
    }

    const ext = (format === 'mp3') ? 'mp3' : 'mp4';
    const safeTitle = (apiData.title || 'video')
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 100);
    const fileName = safeTitle + '.' + ext;

    debug.step = 'sucesso';

    return res.status(200).json({
      download_url: downloadUrl,
      title: apiData.title || 'Video',
      filename: fileName,
      duration: apiData.lengthSeconds || null,
      uploader: apiData.channel ? apiData.channel.name : null,
      info: selectedInfo,
      debug: debug
    });

  } catch (err) {
    debug.errorAt = err.message;
    debug.errorStack = err.stack ? err.stack.substring(0, 500) : 'sem stack';
    return res.status(500).json({ 
      error: 'Erro interno: ' + err.message,
      debug: debug
    });
  }
};
