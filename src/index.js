const express = require('express');
const db = require('./db'); // Importa o arquivo de banco de dados
require('dotenv').config();

const app = express();
const porta = process.env.PORT || 3000;

app.use(express.json()); // Permite que a API entenda dados JSON

// Nossa primeira rota de teste!
app.get('/', (req, res) => {
    res.send('A API do app_gudan está online e rodando! ');
});

// Ligando o servidor
app.listen(porta, () => {
    console.log(`Servidor rodando perfeitamente na porta ${porta}`);
});