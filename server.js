const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve o arquivo HTML da interface
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'aurium.html'));
});

// Credenciais dinâmicas mantidas em memória caso inseridas no front
let activeCredentials = {
  token: process.env.WHATSAPP_TOKEN || '',
  phoneId: process.env.PHONE_NUMBER_ID || '',
  wabaId: process.env.WABA_ID || ''
};

function getCredentials() {
  return {
    token: activeCredentials.token || process.env.WHATSAPP_TOKEN || '',
    phoneId: activeCredentials.phoneId || process.env.PHONE_NUMBER_ID || '',
    wabaId: activeCredentials.wabaId || process.env.WABA_ID || ''
  };
}

// Check de Conexão Backend
app.get('/api/status', (req, res) => {
  const creds = getCredentials();
  res.json({
    connected: Boolean(creds.token && creds.phoneId),
    phoneId: creds.phoneId || null,
    wabaId: creds.wabaId || null
  });
});

// Salvar Credenciais dinâmicas da tela
app.post('/api/credentials', (req, res) => {
  const { token, phoneId, wabaId } = req.body;
  if (token) activeCredentials.token = token;
  if (phoneId) activeCredentials.phoneId = phoneId;
  if (wabaId) activeCredentials.wabaId = wabaId;

  res.json({ success: true, message: 'Credenciais vinculadas com sucesso!' });
});

// Endpoint de Envio de Mensagem Individual
app.post('/send-message', async (req, res) => {
  const { to, message } = req.body;
  const creds = getCredentials();

  if (!to || !message) {
    return res.status(400).json({ success: false, error: 'Número e mensagem são obrigatórios.' });
  }

  if (!creds.token || !creds.phoneId) {
    return res.status(400).json({
      success: false,
      error: 'Credenciais da Meta não configuradas na Vercel.'
    });
  }

  const formattedPhone = String(to).replace(/\D/g, '');
  const url = `https://graph.facebook.com/v18.0/${creds.phoneId}/messages`;

  try {
    const response = await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        to: formattedPhone,
        type: 'text',
        text: { body: message }
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
    let errorMsg = error.message;
    if (error.response && error.response.data && error.response.data.error) {
      errorMsg = error.response.data.error.message || JSON.stringify(error.response.data.error);
    }
    console.error('Erro Meta API:', errorMsg);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Endpoint para Submeter Template para Aprovação na Meta
app.post('/api/templates/create', async (req, res) => {
  const { name, category, language, bodyText, samples, footerText } = req.body;
  const creds = getCredentials();

  if (!creds.wabaId || !creds.token) {
    return res.status(400).json({
      success: false,
      error: 'WABA ID e Token da Meta são necessários para criar templates.'
    });
  }

  const formattedName = String(name || '').toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

  const components = [];

  const bodyComponent = {
    type: 'BODY',
    text: bodyText
  };

  // Se houver variáveis {{1}}, {{2}}... exige o objeto example com array de strings
  if (samples && Array.isArray(samples) && samples.length > 0) {
    const cleanSamples = samples.map(s => String(s || 'Exemplo'));
    bodyComponent.example = {
      body_text: [cleanSamples]
    };
  }

  components.push(bodyComponent);

  if (footerText && String(footerText).trim().length > 0) {
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
    let errorMsg = error.message;
    if (error.response && error.response.data && error.response.data.error) {
      const metaErr = error.response.data.error;
      errorMsg = metaErr.error_user_msg || metaErr.message || JSON.stringify(metaErr);
    }
    console.error('Erro na criação de template:', errorMsg);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Endpoint para Listar Templates
app.get('/api/templates', async (req, res) => {
  const creds = getCredentials();

  if (!creds.wabaId || !creds.token) {
    return res.status(400).json({
      success: false,
      error: 'WABA ID e Token são necessários para buscar templates.'
    });
  }

  const url = `https://graph.facebook.com/v18.0/${creds.wabaId}/message_templates`;

  try {
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${creds.token}` }
    });

    res.json({ success: true, templates: response.data.data });
  } catch (error) {
    let errorMsg = error.message;
    if (error.response && error.response.data && error.response.data.error) {
      errorMsg = error.response.data.error.message || JSON.stringify(error.response.data.error);
    }
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Exporta para a Vercel Serverless Function
module.exports = app;

// Execução local
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`AuriumHub rodando na porta ${PORT}`);
  });
}