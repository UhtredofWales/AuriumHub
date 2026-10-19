const express = require('express');
const path = require('path');
const axios = require('axios');

// Versão configurável da Graph API da Meta.
// Pode ser alterada com META_GRAPH_VERSION no ambiente de produção.
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v26.0';

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

// Verificar conexão e consultar o número exibido na Meta
app.get('/api/status', async (req, res) => {
  const creds = getCredentials();

  if (!creds.token || !creds.phoneId) {
    return res.json({
      connected: false,
      phoneId: creds.phoneId || null,
      wabaId: creds.wabaId || null,
      displayPhoneNumber: null,
      verifiedName: null,
      error: 'Credenciais incompletas.'
    });
  }

  try {
    const url =
      `https://graph.facebook.com/${META_GRAPH_VERSION}` +
      `/${creds.phoneId}`;

    const response = await axios.get(url, {
      params: {
        fields: 'display_phone_number,verified_name'
      },
      headers: {
        Authorization: `Bearer ${creds.token}`
      }
    });

    return res.json({
      connected: true,
      phoneId: creds.phoneId,
      wabaId: creds.wabaId || null,
      displayPhoneNumber: response.data.display_phone_number || null,
      verifiedName: response.data.verified_name || null
    });
  } catch (error) {
    const metaError = error.response?.data?.error;

    return res.status(200).json({
      connected: false,
      phoneId: creds.phoneId,
      wabaId: creds.wabaId || null,
      displayPhoneNumber: null,
      verifiedName: null,
      error: metaError?.message || 'Não foi possível consultar o número na Meta.'
    });
  }
});

// Salvar/Atualizar Credenciais em Tempo de Execução
app.post('/api/credentials', (req, res) => {
  const { token, phoneId, wabaId } = req.body;
  if (token !== undefined) activeCredentials.token = String(token).trim();
  if (phoneId !== undefined) activeCredentials.phoneId = String(phoneId).trim();
  if (wabaId !== undefined) activeCredentials.wabaId = String(wabaId).trim();

  const current = getCredentials();
  res.json({
    success: true,
    message: 'Credenciais salvas com sucesso!',
    credentials: {
      phoneId: current.phoneId || null,
      wabaId: current.wabaId || null,
      configured: Boolean(current.token && current.phoneId)
    }
  });
});

// Envio de Mensagem Individual ou Template Aprovado (Disparos / Campanhas)
app.post('/send-message', async (req, res) => {
  const { to, message, templateName, language, templateParams = [] } = req.body;
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
  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${creds.phoneId}/messages`;

  // Monta o payload dependendo se foi selecionado um template aprovado ou texto simples
  let payload = {};
  if (templateName) {
    const template = {
      name: String(templateName).trim(),
      language: { code: language || 'pt_BR' }
    };

    // Templates com {{1}}, {{2}}, etc. precisam receber os parâmetros
    // na mesma ordem em que aparecem no corpo do template.
    if (Array.isArray(templateParams) && templateParams.length > 0) {
      template.components = [
        {
          type: 'body',
          parameters: templateParams.map(value => ({
            type: 'text',
            text: String(value ?? '')
          }))
        }
      ];
    }

    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'template',
      template
    };
  } else {
    payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'text',
      text: {
        preview_url: true,
        body: message || 'Mensagem via AuriumHub'
      }
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

  // Se houver amostras passadas para variáveis {{1}}, {{2}}...
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

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${creds.wabaId}/message_templates`;

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

  const url = `https://graph.facebook.com/${META_GRAPH_VERSION}/${creds.wabaId}/message_templates`;

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