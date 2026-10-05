module.exports = async function handler(req, res) {
  // Configuração de CORS para o Blogger
  res.setHeader('Access-Control-Allow-Origin', 'https://demetub.blogspot.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const { url, format } = req.body || {};
  if (!url) return res.status(400).json({ error: 'URL ausente' });

  try {
    const rapidApiHost = process.env.RAPIDAPI_HOST;
    const rapidApiKey = process.env.RAPIDAPI_KEY;

    if (!rapidApiHost || !rapidApiKey) {
      return res.status(500).json({ error: 'Credenciais da RapidAPI não configuradas.' });
    }

    // Chama a API da RapidAPI (exemplo para a API YouTube MP3)
    const apiResponse = await fetch(`https://${rapidApiHost}/dl?id=${encodeURIComponent(url)}`, {
      method: 'GET',
      headers: {
        'X-RapidAPI-Key': rapidApiKey,
        'X-RapidAPI-Host': rapidApiHost
      }
    });

    const apiData = await apiResponse.json();

    if (!apiResponse.ok || apiData.status !== 'ok') {
      // Se a API devolver um erro, repassa a mensagem
      return res.status(apiResponse.status).json({ 
        error: apiData.msg || apiData.message || 'Falha na API de download.' 
      });
    }

    // A API geralmente devolve um link direto para o ficheiro
    return res.status(200).json({
      download_url: apiData.link, // O campo pode variar (link, url, download_url)
      title: 'Download via RapidAPI', // A API pode não devolver o título
      duration: null,
      uploader: null
    });

  } catch (err) {
    console.error('Erro no proxy RapidAPI:', err);
    return res.status(500).json({ error: 'Erro interno ao contactar o serviço de download.' });
  }
};
