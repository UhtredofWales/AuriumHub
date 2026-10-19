const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos se houver
app.use(express.static(path.join(__dirname, 'public')));

// Rota Principal - Serve o painel completo
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'aurium.html'));
});

// Endpoint para verificar status da conexão Meta
app.get('/api/status', (req, res) => {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.PHONE_NUMBER_ID;

  if (token && phoneId) {
    res.json({ connected: true, phoneId: phoneId });
  } else {
    res.json({ connected: false });
  }
});

// Endpoint de Envio de Mensagem via Meta API
app.post('/send-message', async (req, res) => {
  const { to, message } = req.body;

  if (!to || !message) {
    return res.status(400).json({ success: false, error: 'Número e mensagem são obrigatórios.' });
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneId = process.env.PHONE_NUMBER_ID;

  if (!token || !phoneId) {
    return res.status(500).json({ 
      success: false, 
      error: 'Credenciais da Meta não configuradas na Vercel.' 
    });
  }

  // Formata o número (remove +, - e espaços)
  const formattedPhone = to.replace(/\D/g, '');

  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

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
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    res.json({ success: true, data: response.data });
  } catch (error) {
    console.error('Erro Meta API:', error.response ? error.response.data : error.message);
    res.status(500).json({
      success: false,
      error: error.response ? error.response.data : error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AuriumHub rodando na porta ${PORT}`);
});