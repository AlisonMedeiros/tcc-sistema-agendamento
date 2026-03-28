const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const SECRET_KEY = process.env.JWT_SECRET || 'gudem_secreto_super_seguro_2026';

function verificarToken(req, res, next) {
    const token = req.headers['authorization'];
    if (!token) return res.status(401).json({ erro: 'Acesso negado. Token não fornecido.' });

    try {
        const decoded = jwt.verify(token.replace('Bearer ', ''), SECRET_KEY);
        req.usuario = decoded;
        next();
    } catch (e) {
        res.status(401).json({ erro: 'Token inválido ou expirado.' });
    }
}
const app = express();
const porta = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        ok: true,
        mensagem: 'API do Sistema de Agendamento – Güdem',
        rotas: ['GET /servicos', 'GET /pagamentos', 'GET /agendamentos', 'POST /agendar'],
    });
});

/**
 * Dashboard: Agendamentos de Hoje com breakdown por status
 */
app.get('/dashboard/hoje', verificarToken, async (req, res) => {
    try {
        const resultado = await db.query(`
            SELECT
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE status = 'concluido') AS concluidos,
                COUNT(*) FILTER (WHERE status IN ('marcado', 'confirmado')) AS pendentes,
                COUNT(*) FILTER (WHERE status = 'cancelado') AS cancelados
            FROM agendamentos
            WHERE CAST(data_hora_inicio AS DATE) = CURRENT_DATE
        `);
        const row = resultado.rows[0];
        res.json({
            total: parseInt(row.total, 10),
            concluidos: parseInt(row.concluidos, 10),
            pendentes: parseInt(row.pendentes, 10),
            cancelados: parseInt(row.cancelados, 10)
        });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar agendamentos de hoje.' });
    }
});

/**
 * Dashboard: Total de clientes cadastrados
 */
app.get('/dashboard/clientes', verificarToken, async (req, res) => {
    try {
        const resultado = await db.query('SELECT COUNT(*) AS total FROM clientes');
        res.json({ total: parseInt(resultado.rows[0].total, 10) });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao contar clientes.' });
    }
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

/** Busca cliente pelo e-mail para preenchimento automático */
app.get('/clientes/buscar', async (req, res) => {
    const { email } = req.query;
    if (!email) return res.status(400).json({ erro: 'Informe o e-mail.' });
    try {
        const resultado = await db.query(
            'SELECT id_cliente, nome, telefone, email FROM clientes WHERE email = $1 LIMIT 1',
            [String(email).trim().toLowerCase()]
        );
        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: 'Cliente não encontrada.' });
        }
        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar cliente.' });
    }
});

/** Cadastra um novo cliente pré-registrado (sem agendamento) */
app.post('/clientes', async (req, res) => {
    const { nome, telefone, email } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Nome é obrigatório.' });
    try {
        // Verifica se telefone já existe
        if (telefone) {
            const existente = await db.query('SELECT id_cliente FROM clientes WHERE telefone = $1', [telefone.trim()]);
            if (existente.rows.length > 0) {
                return res.status(409).json({ erro: 'Já existe uma cliente cadastrada com este telefone.' });
            }
        }
        const resultado = await db.query(
            'INSERT INTO clientes (nome, telefone, email) VALUES ($1, $2, $3) RETURNING id_cliente, nome, telefone, email',
            [nome.trim(), telefone ? telefone.trim() : null, email ? email.trim() : null]
        );
        res.status(201).json({ mensagem: 'Cliente cadastrada com sucesso!', cliente: resultado.rows[0] });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao cadastrar cliente.' });
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

/** Últimos agendamentos (com filtro opcional por data) */
app.get('/agendamentos', async (req, res) => {
    try {
        const limite = Math.min(parseInt(req.query.limite, 10) || 50, 100);
        const dataFiltro = req.query.data;

        let query = `
            SELECT
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
        `;
        const params = [];
        
        if (dataFiltro) {
            query += ` WHERE CAST(a.data_hora_inicio AS DATE) = $1::date`;
            params.push(dataFiltro);
        }

        query += ` ORDER BY a.data_hora_inicio DESC`;
        
        params.push(limite);
        query += ` LIMIT $${params.length}`;

        const resultado = await db.query(query, params);
        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar agendamentos.' });
    }
});

/**
 * Estatísticas Mensais (Serviços x Receitas)
 */
app.get('/estatisticas/mensal', verificarToken, async (req, res) => {
    try {
        const resultado = await db.query(`
            SELECT 
                TO_CHAR(a.data_hora_inicio, 'YYYY-MM') AS mes,
                COUNT(DISTINCT a.id_agendamento) AS total_agendamentos,
                COALESCE(SUM(l.valor), 0) AS faturamento
            FROM agendamentos a
            LEFT JOIN lancamentos_financeiros l ON a.id_agendamento = l.id_agendamento AND l.tipo = 'entrada'
            WHERE a.status IN ('marcado', 'confirmado', 'concluido')
            GROUP BY mes
            ORDER BY mes ASC
            LIMIT 12
        `);
        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao gerar estatísticas mensais.' });
    }
});

/**
 * Agendamentos do Cliente Logado
 */
app.get('/meus-agendamentos', verificarToken, async (req, res) => {
    try {
        const idUsuario = req.usuario.id;

        const clienteRes = await db.query(
            'SELECT id_cliente FROM clientes WHERE id_usuario = $1',
            [idUsuario]
        );

        if (clienteRes.rows.length === 0) {
            return res.json([]);
        }

        const idCliente = clienteRes.rows[0].id_cliente;

        const resultado = await db.query(`
            SELECT 
                a.id_agendamento,
                s.nome AS servico,
                a.data_hora_inicio,
                a.data_hora_fim,
                a.status::text AS status,
                a.observacoes
            FROM agendamentos a
            INNER JOIN servicos s ON s.id_servico = a.id_servico
            WHERE a.id_cliente = $1
            ORDER BY a.data_hora_inicio DESC
        `, [idCliente]);

        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar seus agendamentos.' });
    }
});

/**
 * Cria agendamento
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

    if (!nome_cliente || !String(nome_cliente).trim() || !id_servico || !data_hora_inicio) {
        return res.status(400).json({ erro: 'Campos obrigatórios ausentes.' });
    }

    const inicio = new Date(data_hora_inicio);
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const tel = telefone ? String(telefone).trim() : null;
        const mail = email ? String(email).trim() : null;
        const nome = String(nome_cliente).trim();

        let id_cliente;
        if (tel) {
            const existente = await client.query('SELECT id_cliente FROM clientes WHERE telefone = $1 LIMIT 1', [tel]);
            if (existente.rows.length) {
                id_cliente = existente.rows[0].id_cliente;
                await client.query('UPDATE clientes SET nome = $1, email = COALESCE($2, email) WHERE id_cliente = $3', [nome, mail, id_cliente]);
            }
        }

        if (id_cliente === undefined) {
            const ins = await client.query('INSERT INTO clientes (nome, telefone, email) VALUES ($1, $2, $3) RETURNING id_cliente', [nome, tel, mail]);
            id_cliente = ins.rows[0].id_cliente;
        }

        const srv = await client.query('SELECT duracao_minutos, preco_padrao FROM servicos WHERE id_servico = $1 AND ativo = TRUE', [id_servico]);
        if (!srv.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ erro: 'Serviço inválido ou inativo.' });
        }

        const duracaoMin = Number(srv.rows[0].duracao_minutos) || 60;
        const preco = srv.rows[0].preco_padrao;
        const fim = new Date(inicio.getTime() + duracaoMin * 60 * 1000);

        const conflito = await client.query(
            `SELECT id_agendamento FROM agendamentos 
             WHERE status != 'cancelado' AND (data_hora_inicio < $2 AND data_hora_fim > $1)`,
            [inicio.toISOString(), fim.toISOString()]
        );

        if (conflito.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ erro: 'Horário já ocupado.' });
        }

        const ag = await client.query(
            `INSERT INTO agendamentos (id_cliente, id_servico, data_hora_inicio, data_hora_fim, status, observacoes) 
             VALUES ($1, $2, $3, $4, 'marcado', $5) RETURNING *`,
            [id_cliente, id_servico, inicio.toISOString(), fim.toISOString(), observacoes || null]
        );

        if (id_metodo_pagamento) {
            await client.query(
                `INSERT INTO lancamentos_financeiros (id_agendamento, tipo, descricao, valor, categoria, id_metodo_pagamento) 
                 VALUES ($1, 'entrada', $2, $3, 'Serviço', $4)`,
                [ag.rows[0].id_agendamento, `Agendamento #${ag.rows[0].id_agendamento}`, preco, id_metodo_pagamento]
            );
        }

        await client.query('COMMIT');
        res.status(201).json({ mensagem: 'Agendamento realizado.', agendamento: ag.rows[0] });
    } catch (erro) {
        await client.query('ROLLBACK');
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao agendar.' });
    } finally {
        client.release();
    }
});

app.put('/agendamentos/:id/status', verificarToken, async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const resultado = await client.query(
            'UPDATE agendamentos SET status = $1, atualizado_em = NOW() WHERE id_agendamento = $2 RETURNING *',
            [status, id]
        );

        // Se cancelado, remove o lançamento financeiro vinculado
        if (status === 'cancelado') {
            await client.query(
                'DELETE FROM lancamentos_financeiros WHERE id_agendamento = $1',
                [id]
            );
        }

        await client.query('COMMIT');
        res.json(resultado.rows[0]);
    } catch (erro) {
        await client.query('ROLLBACK');
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao atualizar status.' });
    } finally {
        client.release();
    }
});

app.get('/financeiro/resumo', verificarToken, async (req, res) => {
    try {
        const resultado = await db.query(`
            SELECT COALESCE(SUM(l.valor), 0) AS total_faturamento
            FROM lancamentos_financeiros l
            INNER JOIN agendamentos a ON a.id_agendamento = l.id_agendamento
            WHERE l.tipo = 'entrada'
              AND a.status != 'cancelado'
        `);
        res.json({ faturamento: Number(resultado.rows[0].total_faturamento) });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao extrair faturamento.' });
    }
});

app.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const resultado = await db.query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
        const usuario = resultado.rows[0];
        if (!usuario) return res.status(401).json({ erro: 'Credenciais inválidas.' });

        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida && usuario.senha_hash !== senha) return res.status(401).json({ erro: 'Credenciais inválidas.' });

        const token = jwt.sign({ id: usuario.id_usuario, tipo: usuario.tipo }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ usuario: { id: usuario.id_usuario, nome: usuario.nome, tipo: usuario.tipo }, token });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro no login.' });
    }
});

app.post('/servicos', verificarToken, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado.' });
    const { nome, descricao, duracao_minutos, preco_padrao } = req.body;
    try {
        const resultado = await db.query('INSERT INTO servicos (nome, descricao, duracao_minutos, preco_padrao) VALUES ($1, $2, $3, $4) RETURNING *', [nome, descricao, duracao_minutos, preco_padrao]);
        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao criar serviço.' });
    }
});

app.put('/servicos/:id', verificarToken, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado.' });
    const { id } = req.params;
    const { nome, descricao, duracao_minutos, preco_padrao, ativo } = req.body;
    try {
        const resultado = await db.query(
            `UPDATE servicos SET nome = $1, descricao = $2, duracao_minutos = $3, preco_padrao = $4, ativo = $5, atualizado_em = NOW() WHERE id_servico = $6 RETURNING *`,
            [nome, descricao, duracao_minutos, preco_padrao, ativo, id]
        );
        res.json(resultado.rows[0]);
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao atualizar serviço.' });
    }
});

const pastaPublica = path.resolve(__dirname, '../public');
app.use(express.static(pastaPublica));

const HOST = '0.0.0.0';
app.listen(porta, HOST, () => {
    console.log(`Servidor rodando em http://${HOST}:${porta}`);
});
