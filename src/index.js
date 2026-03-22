const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();
console.log("Teste de Senha no ENV:", process.env.DB_PASSWORD);
const app = express();
const porta = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        ok: true,
        mensagem: 'API do Sistema de Agendamento – Gündem',
        rotas: ['GET /servicos', 'GET /pagamentos', 'GET /agendamentos', 'POST /agendar'],
    });
});

/** Lista serviços ativos */
app.get('/servicos', async (req, res) => {
    try {
        const resultado = await db.query(
            `SELECT id_servico, nome, descricao, duracao_minutos, preco_padrao, ativo
             FROM servicos
             WHERE ativo = TRUE
             ORDER BY nome`
        );
        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar serviços no banco de dados.' });
    }
});

app.get('/clientes', async (req, res) => {
    try {
        const resultado = await db.query(
            'SELECT id_cliente, nome, telefone, email FROM clientes ORDER BY nome'
        );
        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar clientes no banco de dados.' });
    }
});

/** Métodos de pagamento ativos (MER: metodos_pagamento) */
app.get('/pagamentos', async (req, res) => {
    try {
        const resultado = await db.query(
            `SELECT id_metodo_pagamento, nome, ativo
             FROM metodos_pagamento
             WHERE ativo = TRUE
             ORDER BY nome`
        );
        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar métodos de pagamento.' });
    }
});

/** Últimos agendamentos (para exibir na página) */
app.get('/agendamentos', async (req, res) => {
    try {
        const limite = Math.min(parseInt(req.query.limite, 10) || 50, 100);
        const resultado = await db.query(
            `SELECT
                a.id_agendamento,
                c.nome AS cliente,
                c.telefone AS cliente_telefone,
                s.nome AS servico,
                a.data_hora_inicio,
                a.data_hora_fim,
                a.status::text AS status
             FROM agendamentos a
             INNER JOIN clientes c ON c.id_cliente = a.id_cliente
             INNER JOIN servicos s ON s.id_servico = a.id_servico
             ORDER BY a.data_hora_inicio DESC
             LIMIT $1`,
            [limite]
        );
        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar agendamentos.' });
    }
});

/**
 * Cria cliente (se necessário), agendamento com início/fim conforme duração do serviço
 * e, opcionalmente, lançamento financeiro de entrada (MER).
 */
app.post('/agendar', async (req, res) => {
    const {
        nome_cliente,
        telefone,
        email,
        id_servico,
        data_hora_inicio,
        id_metodo_pagamento,
        observacoes,
    } = req.body;

    if (!nome_cliente || !String(nome_cliente).trim()) {
        return res.status(400).json({ erro: 'Informe o nome do cliente.' });
    }
    if (!id_servico) {
        return res.status(400).json({ erro: 'Selecione um serviço.' });
    }
    if (!data_hora_inicio) {
        return res.status(400).json({ erro: 'Informe data e hora de início.' });
    }

    const inicio = new Date(data_hora_inicio);
    if (Number.isNaN(inicio.getTime())) {
        return res.status(400).json({ erro: 'Data/hora de início inválida.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const tel = telefone && String(telefone).trim() ? String(telefone).trim() : null;
        const mail = email && String(email).trim() ? String(email).trim() : null;
        const nome = String(nome_cliente).trim();

        let id_cliente;
        if (tel) {
            const existente = await client.query(
                'SELECT id_cliente FROM clientes WHERE telefone = $1 LIMIT 1',
                [tel]
            );
            if (existente.rows.length) {
                id_cliente = existente.rows[0].id_cliente;
                await client.query(
                    `UPDATE clientes SET nome = $1, email = COALESCE($2, email), atualizado_em = NOW()
                     WHERE id_cliente = $3`,
                    [nome, mail, id_cliente]
                );
            }
        }

        if (id_cliente === undefined) {
            const ins = await client.query(
                `INSERT INTO clientes (nome, telefone, email)
                 VALUES ($1, $2, $3)
                 RETURNING id_cliente`,
                [nome, tel, mail]
            );
            id_cliente = ins.rows[0].id_cliente;
        }

        const srv = await client.query(
            'SELECT duracao_minutos, preco_padrao FROM servicos WHERE id_servico = $1 AND ativo = TRUE',
            [id_servico]
        );
        if (!srv.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ erro: 'Serviço inválido ou inativo.' });
        }

        const duracaoMin = Number(srv.rows[0].duracao_minutos) || 60;
        const preco = srv.rows[0].preco_padrao;
        const fim = new Date(inicio.getTime() + duracaoMin * 60 * 1000);

        // 1. Validação de Horário Comercial (08:00 às 18:00)
        const horaInicio = inicio.getHours();
        const horaFim = fim.getHours();
        const minFim = fim.getMinutes();
        
        if (horaInicio < 8 || horaFim > 18 || (horaFim === 18 && minFim > 0)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ erro: 'O horário de atendimento do estúdio é das 08:00 às 18:00.' });
        }

        // 2. Validação de Choque de Horários
        const conflito = await client.query(
            `SELECT id_agendamento FROM agendamentos 
             WHERE status != 'cancelado'
             AND (data_hora_inicio < $2 AND data_hora_fim > $1)`,
            [inicio.toISOString(), fim.toISOString()]
        );

        if (conflito.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ erro: 'Desculpe, este horário já está ocupado por outro atendimento.' });
        }

        const ag = await client.query(
            `INSERT INTO agendamentos (
                id_cliente, id_servico, data_hora_inicio, data_hora_fim, status, observacoes
            ) VALUES ($1, $2, $3, $4, 'marcado', $5)
            RETURNING *`,
            [id_cliente, id_servico, inicio.toISOString(), fim.toISOString(), observacoes || null]
        );

        const rowAg = ag.rows[0];

        if (id_metodo_pagamento) {
            await client.query(
                `INSERT INTO lancamentos_financeiros (
                    id_agendamento, tipo, descricao, valor, data_lancamento, id_metodo_pagamento
                ) VALUES ($1, 'entrada', $2, $3, CURRENT_DATE, $4)`,
                [
                    rowAg.id_agendamento,
                    `Pré-registro – agendamento #${rowAg.id_agendamento}`,
                    preco,
                    id_metodo_pagamento,
                ]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({
            mensagem: 'Agendamento realizado com sucesso.',
            agendamento: rowAg,
        });
    } catch (erro) {
        try {
            await client.query('ROLLBACK');
        } catch (rb) {
            console.error(rb);
        }
        console.error('Erro no servidor:', erro);
        res.status(500).json({ erro: 'Erro ao salvar agendamento. Verifique o banco e o esquema (docs/schema.sql).' });
    } finally {
        client.release();
    }
});

/** Atualizar status do agendamento (Ex: pelo painel admin) */
app.put('/agendamentos/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['marcado', 'confirmado', 'concluido', 'cancelado'].includes(status)) {
        return res.status(400).json({ erro: 'Status inválido.' });
    }

    try {
        const resultado = await db.query(
            `UPDATE agendamentos 
             SET status = $1, atualizado_em = NOW() 
             WHERE id_agendamento = $2 
             RETURNING id_agendamento, status`,
            [status, id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: 'Agendamento não encontrado.' });
        }

        res.json({ mensagem: 'Status atualizado com sucesso.', agendamento: resultado.rows[0] });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao atualizar o status do agendamento.' });
    }
});
/**
 * Rota de Autenticação (Login)
 * Verifica as credenciais na tabela 'usuarios'
 */
app.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    // 1. Validação básica de entrada
    if (!email || !senha) {
        return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
    }

    try {
        // 2. Consulta ao banco de dados
        // IMPORTANTE: No futuro, use a biblioteca 'bcrypt' para comparar senhas criptografadas
        const resultado = await db.query(
            'SELECT id_usuario, nome, email, senha_hash, tipo FROM usuarios WHERE email = $1',
            [email.toLowerCase().trim()]
        );

        const usuario = resultado.rows[0];

        // 3. Verificação de existência e senha
        if (!usuario || usuario.senha_hash !== senha) {
            return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
        }

        // 4. Sucesso no login
        res.json({
            mensagem: 'Login bem-sucedido!',
            usuario: {
                id: usuario.id_usuario,
                nome: usuario.nome,
                tipo: usuario.tipo
            },
            // Em um sistema real, aqui geraríamos um Token JWT
            token: "sessao_ativa_" + usuario.id_usuario 
        });

    } catch (erro) {
        console.error('Erro no processamento do login:', erro);
        res.status(500).json({ erro: 'Erro interno no servidor ao tentar logar.' });
    }
});
// Servir index.html e assets depois das rotas da API (GET / continua sendo JSON)
app.use(express.static(path.join(__dirname, '../public')));

app.listen(porta, () => {
    console.log(`Servidor em http://localhost:${porta}`);
});
