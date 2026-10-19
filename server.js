const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// Rota que faz a ponte segura com a API da Meta
app.post('/api/send', async (req, res) => {
    const { to, message } = req.body;
    const cleanPhone = String(to).replace(/\D/g, '');

    try {
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${process.env.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: cleanPhone,
                type: "text",
                text: { body: message }
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        res.json({ success: true, data: response.data });
    } catch (error) {
        console.error('Erro na Meta API:', error.response?.data || error.message);
        res.status(500).json({ 
            success: false, 
            error: error.response?.data?.error?.message || 'Erro ao enviar mensagem.' 
        });
    }
});

const PORT = process.env.PORT ||5000;
app.listen(PORT, () => console.log(`🚀 AuriumHub rodando em: http://localhost:${PORT}`));