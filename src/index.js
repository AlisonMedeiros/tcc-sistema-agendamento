const express = require('express');
const cors = require('cors'); // <-- LINHA NOVA AQUI
const db = require('./db'); 
require('dotenv').config();

const app = express();
const porta = process.env.PORT || 3000;

app.use(cors()); // <-- LINHA NOVA AQUI (Libera a catraca pro Front-end!)
app.use(express.json()); 

// ... (o resto das suas rotas continua igualzinho para baixo)

app.use(express.json()); 

// Nossa primeira rota de teste!
app.get('/', (req, res) => {
    res.send('A API do app_gundan está online e rodando! 🚀');
});

// === NOVA ROTA: BUSCAR SERVIÇOS ===
app.get('/servicos', async (req, res) => {
    try {
        // O código vai lá no PostgreSQL, bate na porta e pede todos os serviços
        const resultado = await db.query('SELECT * FROM servicos');
        
        // Devolve os dados para a tela em formato JSON (que o seu HTML/JavaScript vai adorar ler depois)
        res.json(resultado.rows); 
    } catch (erro) {
        console.error(erro);
        res.status(500).send('Erro ao buscar os serviços no banco de dados');
    }
});
// ==================================

// Ligando o servidor
app.listen(porta, () => {
    console.log(`Servidor rodando perfeitamente na porta ${porta}`);
});
// === NOVA ROTA: BUSCAR CLIENTES ===
app.get('/clientes', async (req, res) => {
    try {
        const resultado = await db.query('SELECT * FROM clientes');
        res.json(resultado.rows); 
    } catch (erro) {
        console.error(erro);
        res.status(500).send('Erro ao buscar os clientes no banco de dados');
    }
});

// === ROTA: BUSCAR MÉTODOS DE PAGAMENTO ===
app.get('/pagamentos', async (req, res) => {
    try {
        const resultado = await db.query('SELECT * FROM metodos_pagamento');
        res.json(resultado.rows); 
    } catch (erro) {
        console.error(erro);
        res.status(500).send('Erro ao buscar os métodos de pagamento');
    }
}); // <-- Aqui fecha a rota de pagamentos

// === ROTA: CRIAR AGENDAMENTO (POST) ===
app.post('/agendar', async (req, res) => {
    try {
        const { nome_cliente, data_hora, id_servico, id_metodo } = req.body;

        const query = `
            INSERT INTO agendamentos (id_cliente, id_servico, data_hora, id_metodo, status)
            VALUES (
                (SELECT id_cliente FROM clientes WHERE nome = $1 LIMIT 1), 
                $2, $3, $4, 'Pendente'
            )
            RETURNING *;
        `;

        const valores = [nome_cliente, id_servico, data_hora, id_metodo];
        const resultado = await db.query(query, valores);

        res.status(201).json({ mensagem: 'Agendamento realizado!', agendamento: resultado.rows[0] });
    } catch (erro) {
        console.error("Erro no servidor:", erro);
        res.status(500).send('Erro ao salvar agendamento.');
    }
});

// Ligando o servidor
app.listen(porta, () => {
    console.log(`✅ Servidor rodando perfeitamente na porta ${porta}`);
});