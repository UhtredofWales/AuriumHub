// Submeter Template para Aprovação da Meta com suporte completo a variáveis
app.post('/api/templates/create', async (req, res) => {
  const { name, category, language, bodyText, samples, footerText } = req.body;
  const creds = getCredentials();

  if (!creds.wabaId || !creds.token) {
    return res.status(400).json({
      success: false,
      error: 'WABA ID e Token da Meta são necessários para criar templates.'
    });
  }

  // Nome precisa ter apenas letras minúsculas, números e underline
  const formattedName = name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

  const components = [];

  // Montagem do componente BODY
  const bodyComponent = {
    type: 'BODY',
    text: bodyText
  };

  // Se houver amostras/exemplos passados para as variáveis {{1}}, {{2}}...
  if (samples && Array.isArray(samples) && samples.length > 0) {
    // Garante que todas as amostras sejam strings válidas
    const cleanSamples = samples.map(s => String(s || 'Exemplo'));
    
    bodyComponent.example = {
      body_text: [cleanSamples]
    };
  }

  components.push(bodyComponent);

  // Componente de Rodapé (Opcional)
  if (footerText && String(footerText).trim() !== '') {
    components.push({
      type: 'FOOTER',
      text: String(footerText).trim()
    });
  }

  const url = `https://graph.facebook.com/v18.0/${creds.wabaId}/message_templates`;

  try {
    const response = await axios.post(
      url,
      {
        name: formattedName,
        category: (category || 'MARKETING').toUpperCase(),
        language: language || 'pt_BR',
        components: components
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
    console.error('Erro detalhado da Meta ao criar template:', error.response?.data);
    
    const errObj = error.response?.data?.error;
    let errorDetails = error.message;

    if (errObj) {
      errorDetails = errObj.error_user_msg || errObj.message || JSON.stringify(errObj);
    }

    res.status(500).json({ success: false, error: errorDetails });
  }
});