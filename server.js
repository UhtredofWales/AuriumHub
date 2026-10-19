const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Credenciais em memória ou via Variáveis de Ambiente da Vercel
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

// Rota Principal - Serve o painel HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'aurium.html'));
});

// Status e Salvamento de Credenciais
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
      error: 'Credenciais da Meta não configuradas.'
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

// Submeter Template com Amostras Dinâmicas de Variáveis
app.post('/api/templates/create', async (req, res) => {
  const { name, category, language, bodyText, samples, footerText } = req.body;
  const creds = getCredentials();

  if (!creds.wabaId || !creds.token) {
    return res.status(400).json({
      success: false,
      error: 'WABA ID e Token da Meta são necessários para criar templates.'
    });
  }

  const formattedName = name.toLowerCase().trim().replace(/[^a-z0-9_]/g, '_');

  const components = [];

  // Componente de Corpo
  const bodyComponent = {
    type: 'BODY',
    text: bodyText
  };

  // Se houver amostras enviadas da interface, injeta o parâmetro example exigido pela Meta
  if (samples && Array.isArray(samples) && samples.length > 0) {
    bodyComponent.example = {
      body_text: [samples]
    };
  }

  components.push(bodyComponent);

  // Componente de Rodapé (Opcional)
  if (footerText && footerText.trim() !== '') {
    components.push({
      type: 'FOOTER',
      text: footerText.trim()
    });
  }

  const url = `https://graph.facebook.com/v18.0/${creds.wabaId}/message_templates`;

  try {
    const response = await axios.post(
      url,
      {
        name: formattedName,
        category: category || 'MARKETING',
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
    const errorDetails = error.response && error.response.data && error.response.data.error
      ? error.response.data.error.message || JSON.stringify(error.response.data.error)
      : error.message;

    res.status(500).json({ success: false, error: errorDetails });
  }
});

// Buscar Templates Criados
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
    const errorDetails = error.response && error.response.data && error.response.data.error
      ? error.response.data.error.message || JSON.stringify(error.response.data.error)
      : error.message;

    res.status(500).json({ success: false, error: errorDetails });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AuriumHub rodando na porta ${PORT}`);
});