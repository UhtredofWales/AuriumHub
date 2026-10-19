const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Credenciais dinâmicas em memória (caso o utilizador preencha na aba Conexão Meta)
let activeCredentials = {
  token: process.env.WHATSAPP_TOKEN || '',
  phoneId: process.env.PHONE_NUMBER_ID || '',
  wabaId: process.env.WABA_ID || ''
};

function getCredentials() {
  return {
    token: activeCredentials.token || process.env.WHATSAPP_TOKEN,
    phoneId: activeCredentials.phoneId || process.env.PHONE_NUMBER_ID,
    wabaId: activeCredentials.wabaId || process.env.WABA_ID
  };
}

// Rota Principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'aurium.html'));
});

// Endpoint de Status e Configuração de Credenciais
app.get('/api/status', (req, res) => {
  const creds = getCredentials();
  res.json({
    connected: !!(creds.token && creds.phoneId),
    phoneId: creds.phoneId || null,
    wabaId: creds.wabaId || null
  });
});

app.post('/api/credentials', (req, res) => {
  const { token, phoneId, wabaId } = req.body;
  if (token) activeCredentials.token = token;
  if (phoneId) activeCredentials.phoneId = phoneId;
  if (wabaId) activeCredentials.wabaId = wabaId;

  res.json({ success: true, message: 'Credenciais vinculadas com sucesso!' });
});

// Envio de Mensagem Individual
app.post('/send-message', async (req, res) => {
  const { to, message } = req.body;
  const creds = getCredentials();

  if (!to || !message) {
    return res.status(400).json({ success: false, error: 'Número e mensagem são obrigatórios.' });
  }

  if (!creds.token || !creds.phoneId) {
    return res.status(400).json({
      success: false,
      error: 'Credenciais da Meta não configuradas. Preencha na aba Conexão Meta ou nas Variáveis da Vercel.'
    });
  }

  const formattedPhone = to.replace(/\D/g, '');
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
    const errorDetails = error.response && error.response.data && error.response.data.error
      ? error.response.data.error.message || JSON.stringify(error.response.data.error)
      : error.message;

    console.error('Erro Meta API:', errorDetails);
    res.status(500).json({ success: false, error: errorDetails });
  }
});

// Submeter Template para Aprovação da Meta
app.post('/api/templates/create', async (req, res) => {
  const { name, category, language, bodyText } = req.body;
  const creds = getCredentials();

  if (!creds.wabaId || !creds.token) {
    return res.status(400).json({
      success: false,
      error: 'WABA ID e Token da Meta são necessários para criar templates.'
    });
  }

  const url = `https://graph.facebook.com/v18.0/${creds.wabaId}/message_templates`;

  try {
    const response = await axios.post(
      url,
      {
        name: name.toLowerCase().replace(/\s+/g, '_'),
        category: category || 'MARKETING',
        language: language || 'pt_BR',
        components: [
          {
            type: 'BODY',
            text: bodyText
          }
        ]
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

// Listar Status dos Templates da Meta
app.get('/api/templates', async (req, res) => {
  const creds = getCredentials();

  if (!creds.wabaId || !creds.token) {
    return res.status(400).json({
      success: false,
      error: 'WABA ID e Token são necessários para buscar os templates.'
    });
  }

  const url = `https://graph.facebook.com/v18.0/${creds.wabaId}/message_templates`;

  try {
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${creds.token}` }
    });

    res.json({ success: true, templates: response.data.data });
  } catch (error) {
    const errorDetails = error.response && error.response.data && error.response.data.error
      ? error.response.data.error.message || JSON.stringify(error.response.data.error)
      : error.message;

    res.status(500).json({ success: false, error: errorDetails });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AuriumHub a rodar na porta ${PORT}`);
});