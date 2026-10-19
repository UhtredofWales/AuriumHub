const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir o arquivo HTML principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'aurium.html'));
});

// Credenciais mantidas em memória/ambiente
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

// Check de Conexão e Credenciais Ativas
app.get('/api/status', async (req, res) => {
  const creds = getCredentials();
  
  if (!creds.token || !creds.phoneId) {
    return res.json({
      connected: false,
      phoneId: null,
      wabaId: creds.wabaId || null
    });
  }

  // Tenta buscar informações detalhadas do número na Meta
  try {
    const url = `https://graph.facebook.com/v18.0/${creds.phoneId}`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${creds.token}` }
    });

    res.json({
      connected: true,
      phoneId: creds.phoneId,
      wabaId: creds.wabaId || null,
      displayPhoneNumber: response.data.display_phone_number,
      verifiedName: response.data.verified_name
    });
  } catch (err) {
    res.json({
      connected: true,
      phoneId: creds.phoneId,
      wabaId: creds.wabaId || null
    });
  }
});

// Salvar/Atualizar Credenciais em Tempo de Execução
app.post('/api/credentials', (req, res) => {
  const { token, phoneId, wabaId } = req.body;
  if (token !== undefined) activeCredentials.token = String(token).trim();
  if (phoneId !== undefined) activeCredentials.phoneId = String(phoneId).trim();
  if (wabaId !== undefined) activeCredentials.wabaId = String(wabaId).trim();

  res.json({
    success: true,
    message: 'Credenciais salvas com sucesso!',
    credentials: getCredentials()
  });
});

// Envio de Mensagem Individual ou Template Aprovado com Parâmetros Dinâmicos
app.post('/send-message', async (req, res) => {
  const { to, message, templateName, language, templateParams } = req.body;
  const creds = getCredentials();

  if (!to) {
    return res.status(400).json({ success: false, error: 'Número de destino é obrigatório.' });
  }

  if (!creds.token || !creds.phoneId) {
    return res.status(400).json({
      success: false,
      error: 'Credenciais da Meta não configuradas.'
    });
  }

  const formattedPhone = String(to).replace(/\D/g, '');
  const url = `https://graph.facebook.com/v18.0/${creds.phoneId}/messages`;

  let payload = {};
  if (templateName) {
    const components = [];
    
    // Se houver parâmetros informados (ex: nome do cliente para {{1}}), monta a estrutura exigida pela Meta
    if (templateParams && Array.isArray(templateParams) && templateParams.length > 0) {
      components.push({
        type: 'body',
        parameters: templateParams.map(param => ({
          type: 'text',
          text: String(param)
        }))
      });
    }

    payload = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language || 'pt_BR' },
        ...(components.length > 0 ? { components } : {})
      }
    };
  } else {
    payload = {
      messaging_product: 'whatsapp',
      to: formattedPhone,
      type: 'text',
      text: { body: message || 'Mensagem via AuriumHub' }
    };
  }

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${creds.token}`,
        'Content-Type': 'application/json'
      }
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    let errorMsg = error.message;
    if (error.response && error.response.data && error.response.data.error) {
      const errObj = error.response.data.error;
      errorMsg = `(#${errObj.code || 'API'}) ${errObj.message || JSON.stringify(errObj)}`;
    }
    console.error('Erro Meta API ao enviar:', errorMsg);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Submeter Novo Template para Aprovação na Meta
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
    console.error('Erro ao criar template:', errorMsg);
    res.status(500).json({ success: false, error: errorMsg });
  }
});

// Sincronizar e Listar Templates da Conta na Meta
app.get('/api/templates', async (req, res) => {
  const creds = getCredentials();

  if (!creds.wabaId || !creds.token) {
    return res.status(400).json({
      success: false,
      error: 'WABA ID e Token são necessários para consultar os templates na Meta.'
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

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`AuriumHub rodando na porta ${PORT}`);
  });
}