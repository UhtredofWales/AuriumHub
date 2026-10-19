// Submeter Template para Aprovação da Meta (com suporte a variáveis {{1}})
app.post('/api/templates/create', async (req, res) => {
  const { name, category, language, bodyText } = req.body;
  const creds = getCredentials();

  if (!creds.wabaId || !creds.token) {
    return res.status(400).json({
      success: false,
      error: 'WABA ID e Token da Meta são necessários para criar templates.'
    });
  }

  // Formata o nome para letras minúsculas e sem caracteres especiais
  const formattedName = name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

  // Identifica variáveis no texto como {{1}}, {{2}}
  const matches = bodyText.match(/\{\{\d+\}\}/g);
  const bodyComponent = {
    type: 'BODY',
    text: bodyText
  };

  // Se houver variáveis, adiciona os exemplos exigidos pela Meta
  if (matches && matches.length > 0) {
    const sampleValues = matches.map((_, idx) => `Exemplo${idx + 1}`);
    bodyComponent.example = {
      body_text: [sampleValues]
    };
  }

  const url = `https://graph.facebook.com/v18.0/${creds.wabaId}/message_templates`;

  try {
    const response = await axios.post(
      url,
      {
        name: formattedName,
        category: category || 'MARKETING',
        language: language || 'pt_BR',
        components: [bodyComponent]
      },
      {
        headers: {
          'Authorization': `Bearer ${creds.token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, data: response.data });
  } catch (error) {
    const errorDetails = error.response && error.response.data && error.response.data.error
      ? error.response.data.error.message || JSON.stringify(error.response.data.error)
      : error.message;

    res.status(500).json({ success: false, error: errorDetails });
  }
});