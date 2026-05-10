const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');
const { enviarMensagem } = require('./whatsapp-client');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const SECRET_KEY = process.env.JWT_SECRET || 'gudem_secreto_super_seguro_2026';

// Middleware de Autenticação JWT
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

// Redireciona a raiz para o index
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

/**
 * ==========================================
 * MÓDULO DE SERVIÇOS
 * ==========================================
 */

/** CRIAR NOVO SERVIÇO (Usado na tela de configurações) */
app.post('/servicos', verificarToken, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado.' });
    const { nome, descricao, preco_padrao, duracao_minutos, ativo } = req.body;

    // Validação básica e trava de valor negativo
    if (!nome || preco_padrao === undefined || !duracao_minutos) {
        return res.status(400).json({ erro: 'Nome, preço e duração são obrigatórios.' });
    }
    if (Number(preco_padrao) < 0) {
        return res.status(400).json({ erro: 'O preço do serviço não pode ser negativo.' });
    }

    try {
        const resultado = await db.query(
            `INSERT INTO servicos (nome, descricao, preco_padrao, duracao_minutos, ativo)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [nome, descricao || null, preco_padrao, duracao_minutos, ativo !== undefined ? ativo : true]
        );
        res.status(201).json(resultado.rows[0]);
    } catch (erro) {
        console.error('Erro ao criar serviço:', erro);
        res.status(500).json({ erro: 'Erro interno ao criar o serviço no banco de dados.' });
    }
});

/** ATUALIZAR SERVIÇO EXISTENTE (Usado na tela de configurações) */
app.put('/servicos/:id', verificarToken, async (req, res) => {
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado.' });
    const { id } = req.params;
    const { nome, descricao, preco_padrao, duracao_minutos, ativo } = req.body;

    // Validação básica e trava de valor negativo
    if (!nome || preco_padrao === undefined || !duracao_minutos) {
        return res.status(400).json({ erro: 'Nome, preço e duração são obrigatórios.' });
    }
    if (Number(preco_padrao) < 0) {
        return res.status(400).json({ erro: 'O preço do serviço não pode ser negativo.' });
    }

    try {
        const resultado = await db.query(
            `UPDATE servicos 
             SET nome = $1, descricao = $2, preco_padrao = $3, duracao_minutos = $4, ativo = $5, atualizado_em = NOW()
             WHERE id_servico = $6 
             RETURNING *`,
            [nome, descricao || null, preco_padrao, duracao_minutos, ativo, id]
        );

        if (resultado.rows.length === 0) {
            return res.status(404).json({ erro: 'Serviço não encontrado.' });
        }

        res.json(resultado.rows[0]);
    } catch (erro) {
        console.error('Erro ao atualizar serviço:', erro);
        res.status(500).json({ erro: 'Erro interno ao atualizar o serviço.' });
    }
});

/** Lista serviços (Com filtro para clientes ou completo para admin) */
app.get('/servicos', async (req, res) => {
    try {
        const mostrarTodos = req.query.todos === 'true';
        let querySql = `SELECT id_servico, nome, descricao, duracao_minutos, preco_padrao, ativo FROM servicos`;
        
        if (!mostrarTodos) {
            querySql += ` WHERE ativo = TRUE`;
        }
        querySql += ` ORDER BY nome`;

        const resultado = await db.query(querySql);
        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar serviços no banco de dados.' });
    }
});

/** Excluir um serviço (Soft delete se houver agendamentos vinculados) */
app.delete('/servicos/:id', verificarToken, async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM servicos WHERE id_servico = $1', [id]);
        res.json({ mensagem: 'Serviço excluído com sucesso!' });
    } catch (erro) {
        if (erro.code === '23503') { 
            await db.query('UPDATE servicos SET ativo = false WHERE id_servico = $1', [id]);
            res.json({ mensagem: 'Serviço inativado, pois possui histórico pendente!' });
        } else {
            console.error(erro);
            res.status(500).json({ erro: 'Erro interno ao excluir.' });
        }
    }
});


/**
 * ==========================================
 * MÓDULO DE CLIENTES
 * ==========================================
 */

/** Lista todos os clientes */
app.get('/clientes', verificarToken, async (req, res) => {
    try {
        const resultado = await db.query('SELECT id_cliente, nome, telefone, email FROM clientes ORDER BY nome');
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
        if (resultado.rows.length === 0) return res.status(404).json({ erro: 'Cliente não encontrada.' });
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
        if (telefone) {
            const existente = await db.query('SELECT id_cliente FROM clientes WHERE telefone = $1', [telefone.trim()]);
            if (existente.rows.length > 0) return res.status(409).json({ erro: 'Já existe uma cliente cadastrada com este telefone.' });
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


/**
 * ==========================================
 * MÓDULO DE DASHBOARD E ESTATÍSTICAS
 * ==========================================
 */

/** Dashboard: Agendamentos de Hoje */
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

/** Dashboard: Total de clientes cadastrados */
app.get('/dashboard/clientes', verificarToken, async (req, res) => {
    try {
        const resultado = await db.query('SELECT COUNT(*) AS total FROM clientes');
        res.json({ total: parseInt(resultado.rows[0].total, 10) });
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao contar clientes.' });
    }
});

/** Estatísticas Mensais (Serviços x Receitas) */
app.get('/estatisticas/mensal', verificarToken, async (req, res) => {
    try {
        const resultado = await db.query(`
            SELECT 
                TO_CHAR(a.data_hora_inicio, 'YYYY-MM') AS mes,
                COUNT(DISTINCT a.id_agendamento) AS total_agendamentos,
                COALESCE(SUM(CASE WHEN a.status IN ('confirmado', 'concluido') THEN l.valor ELSE 0 END), 0) AS faturamento
            FROM agendamentos a
            LEFT JOIN lancamentos_financeiros l ON a.id_agendamento = l.id_agendamento AND l.tipo = 'entrada'
            WHERE a.status != 'cancelado'
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
 * ==========================================
 * MÓDULO DE AGENDAMENTOS E PACOTES
 * ==========================================
 */

/** Métodos de pagamento ativos */
app.get('/pagamentos', async (req, res) => {
    try {
        const resultado = await db.query(`SELECT id_metodo_pagamento, nome, ativo FROM metodos_pagamento WHERE ativo = TRUE ORDER BY nome`);
        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar métodos de pagamento.' });
    }
});

/** Últimos agendamentos (Geral) */
app.get('/agendamentos', verificarToken, async (req, res) => {
    try {
        const limite = Math.min(parseInt(req.query.limite, 10) || 50, 100);
        const dataFiltro = req.query.data;

        let query = `
            SELECT a.id_agendamento, c.nome AS cliente, c.telefone AS cliente_telefone, s.nome AS servico, a.data_hora_inicio, a.data_hora_fim, a.status::text AS status
            FROM agendamentos a
            INNER JOIN clientes c ON c.id_cliente = a.id_cliente
            INNER JOIN servicos s ON s.id_servico = a.id_servico
        `;
        const params = [];
        
        if (dataFiltro) {
            query += ` WHERE CAST(a.data_hora_inicio AS DATE) = $1::date`;
            params.push(dataFiltro);
        }

        query += ` ORDER BY a.data_hora_inicio ASC LIMIT $${params.length + 1}`;
        params.push(limite);

        const resultado = await db.query(query, params);
        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao buscar agendamentos.' });
    }
});

/** Agendamentos do Cliente Logado */
app.get('/meus-agendamentos', verificarToken, async (req, res) => {
    try {
        const idUsuario = req.usuario.id;
        const clienteRes = await db.query('SELECT id_cliente FROM clientes WHERE id_usuario = $1', [idUsuario]);

        if (clienteRes.rows.length === 0) return res.json([]);

        const idCliente = clienteRes.rows[0].id_cliente;
        const resultado = await db.query(`
            SELECT a.id_agendamento, s.nome AS servico, a.data_hora_inicio, a.data_hora_fim, a.status::text AS status, a.observacoes
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

/** CRIA AGENDAMENTO SIMPLES */
app.post('/agendar', verificarToken, async (req, res) => {
    const { nome_cliente, telefone, email, id_servico, data_hora_inicio, id_metodo_pagamento, observacoes } = req.body;

    if (!nome_cliente || !String(nome_cliente).trim() || !id_servico || !data_hora_inicio) {
        return res.status(400).json({ erro: 'Campos obrigatórios ausentes.' });
    }

    // AJUSTE DE FUSO HORÁRIO E VIAGEM NO TEMPO
    let strData = String(data_hora_inicio);
    if (!strData.includes('Z') && !strData.includes('-03:00')) {
        if (strData.length === 16) strData += ':00'; 
        strData += '-03:00';
    }
    const inicio = new Date(strData);

    if (inicio < new Date()) {
        return res.status(400).json({ erro: 'Máquina do tempo bloqueada: Não é possível agendar em horários que já passaram.' });
    }

    const client = await db.connect();
    try {
        await client.query('BEGIN');

        const tel = telefone ? String(telefone).trim() : null;
        const mail = email ? String(email).trim() : null;
        const nome = String(nome_cliente).trim();
        let id_cliente;

        // Vínculo de cliente logado ou criação
        if (req.usuario.tipo === 'cliente') {
            const cliReq = await client.query('SELECT id_cliente FROM clientes WHERE id_usuario = $1', [req.usuario.id]);
            if (cliReq.rows.length > 0) {
                id_cliente = cliReq.rows[0].id_cliente;
            } else {
                const ins = await client.query(
                    'INSERT INTO clientes (nome, telefone, email, id_usuario) VALUES ($1, $2, $3, $4) RETURNING id_cliente', 
                    [nome, tel, mail, req.usuario.id]
                );
                id_cliente = ins.rows[0].id_cliente;
            }
        } else {
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
        }

        // Busca serviço e valida conflito
        const srv = await client.query('SELECT duracao_minutos, preco_padrao FROM servicos WHERE id_servico = $1 AND ativo = TRUE', [id_servico]);
        if (!srv.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ erro: 'Serviço inválido ou inativo.' });
        }

        const duracaoMin = Number(srv.rows[0].duracao_minutos) || 60;
        const preco = srv.rows[0].preco_padrao;
        const fim = new Date(inicio.getTime() + duracaoMin * 60 * 1000);

        const conflito = await client.query(
            `SELECT id_agendamento FROM agendamentos WHERE status != 'cancelado' AND (data_hora_inicio < $2 AND data_hora_fim > $1)`,
            [inicio.toISOString(), fim.toISOString()]
        );

        if (conflito.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ erro: 'Horário já ocupado.' });
        }

        // Inserção final
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
        
        // --- INTEGRAÇÃO WHATSAPP ---
        try {
            const cliData = await db.query('SELECT nome, telefone FROM clientes WHERE id_cliente = $1', [id_cliente]);
            const srvData = await db.query('SELECT nome FROM servicos WHERE id_servico = $1', [id_servico]);
            
            if (cliData.rows.length > 0 && cliData.rows[0].telefone) {
                const nomeCli = cliData.rows[0].nome.split(' ')[0];
                const nomeSrv = srvData.rows.length > 0 ? srvData.rows[0].nome : 'Serviço';
                
                const dataFormatada = inicio.toLocaleString('pt-BR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                });
                const textoMensagem = `Olá ${nomeCli}! Seu agendamento de *${nomeSrv}* para ${dataFormatada} foi confirmado com sucesso. Te esperamos no salão Güdem!`;
                enviarMensagem(cliData.rows[0].telefone, textoMensagem);
            }
        } catch (errWhatsApp) {
            console.error('Erro ao tentar enviar WhatsApp pós agendamento:', errWhatsApp);
        }

        res.status(201).json({ mensagem: 'Agendamento realizado.', agendamento: ag.rows[0] });
    } catch (erro) {
        await client.query('ROLLBACK');
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao agendar.' });
    } finally {
        client.release();
    }
});

/** AGENDAMENTO EM LOTE (PACOTE MENSAL/SEMANAL) */
app.post('/agendamentos/pacote', async (req, res) => {
    const { id_cliente, id_servico, data_hora_inicio, qtd_semanas } = req.body;

    if (!id_cliente || !id_servico || !data_hora_inicio || !qtd_semanas) {
        return res.status(400).json({ erro: 'Dados incompletos para fechar o pacote.' });
    }

    // AJUSTE DE FUSO E VIAGEM NO TEMPO PARA PACOTES:
    let strData = String(data_hora_inicio);
    if (!strData.includes('Z') && !strData.includes('-03:00')) {
        if (strData.length === 16) strData += ':00'; 
        strData += '-03:00';
    }
    const dataBaseValida = new Date(strData);

    if (dataBaseValida < new Date()) {
        return res.status(400).json({ erro: 'Máquina do tempo bloqueada: Não é possível fechar um pacote no passado.' });
    }

    const client = await db.connect();

    try {
        await client.query('BEGIN');

        const resServico = await client.query('SELECT duracao_minutos FROM servicos WHERE id_servico = $1', [id_servico]);
        if (resServico.rows.length === 0) throw new Error('Serviço não encontrado.');
        const duracao = resServico.rows[0].duracao_minutos;

        // Utilizamos a data validada e com fuso correto
        let dataBase = dataBaseValida; 
        let agendamentosCriados = [];

        for (let i = 0; i < qtd_semanas; i++) {
            let inicio = new Date(dataBase.getTime() + (i * 7 * 24 * 60 * 60 * 1000));
            let fim = new Date(inicio.getTime() + (duracao * 60 * 1000));

            const conflito = await client.query(`
                SELECT id_agendamento FROM agendamentos
                WHERE status != 'cancelado' AND data_hora_inicio < $2 AND data_hora_fim > $1
            `, [inicio, fim]);

            if (conflito.rows.length > 0) {
                throw new Error(`O horário da semana ${i + 1} (${inicio.toLocaleString('pt-BR')}) já está ocupado por outra cliente! Pacote não foi agendado.`);
            }

            const resInsert = await client.query(`
                INSERT INTO agendamentos (id_cliente, id_servico, data_hora_inicio, data_hora_fim, status)
                VALUES ($1, $2, $3, $4, 'marcado')
                RETURNING id_agendamento, data_hora_inicio
            `, [id_cliente, id_servico, inicio, fim]);

            agendamentosCriados.push(resInsert.rows[0]);
        }

        await client.query('COMMIT');
        res.status(201).json({ mensagem: `${qtd_semanas} semanas agendadas com sucesso!`, agendamentos: agendamentosCriados });

    } catch (erro) {
        await client.query('ROLLBACK');
        console.error('Erro ao agendar pacote:', erro.message);
        res.status(400).json({ erro: erro.message });
    } finally {
        client.release();
    }
});

/** ATUALIZAR STATUS DE AGENDAMENTO (Cancela ou Conclui) */
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

        if (status === 'cancelado') {
            await client.query('DELETE FROM lancamentos_financeiros WHERE id_agendamento = $1', [id]);
        } else if (status === 'concluido' || status === 'confirmado') {
            const checkFin = await client.query('SELECT id_lancamento FROM lancamentos_financeiros WHERE id_agendamento = $1', [id]);
            
            if (checkFin.rows.length === 0) {
                const srv = await client.query(
                    'SELECT s.preco_padrao FROM agendamentos a JOIN servicos s ON a.id_servico = s.id_servico WHERE a.id_agendamento = $1', [id]
                );
                
                if (srv.rows.length > 0) {
                    const preco = srv.rows[0].preco_padrao;
                    await client.query(
                        `INSERT INTO lancamentos_financeiros (id_agendamento, tipo, descricao, valor, categoria) 
                         VALUES ($1, 'entrada', $2, $3, 'Serviço')`,
                        [id, `Agendamento #${id}`, preco]
                    );
                }
            }
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
            WHERE l.tipo = 'entrada' AND a.status IN ('confirmado', 'concluido')
        `);
        res.json({ faturamento: Number(resultado.rows[0].total_faturamento) });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro ao extrair faturamento.' });
    }
});


/**
 * ==========================================
 * MÓDULO DE AUTENTICAÇÃO E USUÁRIOS
 * ==========================================
 */

app.get('/debug-users', async (req, res) => {
    try {
        const resultado = await db.query('SELECT email, senha_hash FROM usuarios');
        res.json(resultado.rows);
    } catch (erro) {
        res.status(500).json({ erro: erro.message });
    }
});

app.post('/registro', async (req, res) => {
    const { nome, email, telefone, senha } = req.body;

    if (!nome || !email || !telefone || !senha) return res.status(400).json({ erro: 'Todos os campos são obrigatórios.' });
    if (senha.length < 6) return res.status(400).json({ erro: 'A senha deve ter pelo menos 6 caracteres.' });

    const emailTratado = email.toLowerCase().trim();
    const clientePool = await db.connect();

    try {
        await clientePool.query('BEGIN');

        const verificaEmail = await clientePool.query('SELECT id_usuario FROM usuarios WHERE email = $1', [emailTratado]);
        if (verificaEmail.rows.length > 0) {
            await clientePool.query('ROLLBACK');
            return res.status(409).json({ erro: 'Este e-mail já está em uso.' });
        }

        const saltRounds = 10;
        const senhaHash = await bcrypt.hash(senha, saltRounds);

        const ins_usuario = await clientePool.query(
            `INSERT INTO usuarios (nome, email, senha_hash, tipo) VALUES ($1, $2, $3, 'cliente') RETURNING id_usuario`,
            [nome.trim(), emailTratado, senhaHash]
        );
        const id_novo_usuario = ins_usuario.rows[0].id_usuario;

        const verificaTelefone = await clientePool.query('SELECT id_cliente FROM clientes WHERE telefone = $1', [telefone.trim()]);
        
        if (verificaTelefone.rows.length > 0) {
            await clientePool.query(
                `UPDATE clientes SET id_usuario = $1, email = $2, nome = $3 WHERE telefone = $4`,
                [id_novo_usuario, emailTratado, nome.trim(), telefone.trim()]
            );
        } else {
            await clientePool.query(
                `INSERT INTO clientes (nome, telefone, email, id_usuario) VALUES ($1, $2, $3, $4)`,
                [nome.trim(), telefone.trim(), emailTratado, id_novo_usuario]
            );
        }

        await clientePool.query('COMMIT');
        res.status(201).json({ mensagem: 'Conta criada com sucesso.' });
    } catch (erro) {
        await clientePool.query('ROLLBACK');
        console.error('Erro no registro:', erro);
        res.status(500).json({ erro: 'Erro interno ao realizar cadastro.' });
    } finally {
        clientePool.release();
    }
});

app.get('/perfil', verificarToken, async (req, res) => {
    try {
        const id_usuario = req.usuario.id;
        const result = await db.query(
            `SELECT u.nome, u.email, c.telefone 
             FROM usuarios u 
             LEFT JOIN clientes c ON c.id_usuario = u.id_usuario 
             WHERE u.id_usuario = $1`, [id_usuario]
        );
        if (result.rows.length === 0) return res.status(404).json({erro: 'Usuário não encontrado.'});
        res.json(result.rows[0]);
    } catch(err) {
        res.status(500).json({erro: 'Erro ao buscar perfil.'});
    }
});

app.put('/perfil', verificarToken, async (req, res) => {
    const { nome, email, telefone, senha } = req.body;
    const id_usuario = req.usuario.id;
    const pool = await db.connect();
    
    try {
        await pool.query('BEGIN');
        
        let queryUser = `UPDATE usuarios SET nome = $1, email = $2`;
        let paramsUser = [nome, email, id_usuario];
        
        if (senha && senha.length >= 6) {
            const senhaHash = await bcrypt.hash(senha, 10);
            queryUser += `, senha_hash = $4`;
            paramsUser.push(senhaHash);
            queryUser += ` WHERE id_usuario = $3`;
        } else {
            queryUser += ` WHERE id_usuario = $3`;
        }
        
        await pool.query(queryUser, paramsUser);
        
        const cliCheck = await pool.query('SELECT id_cliente FROM clientes WHERE id_usuario = $1', [id_usuario]);
        if (cliCheck.rows.length > 0) {
            await pool.query('UPDATE clientes SET nome = $1, email = $2, telefone = $3 WHERE id_usuario = $4', 
                [nome, email, telefone || null, id_usuario]);
        }
        
        await pool.query('COMMIT');
        res.json({ mensagem: 'Perfil atualizado com sucesso!' });
    } catch(err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({erro: 'Erro ao atualizar perfil.'});
    } finally {
        pool.release();
    }
});

app.post('/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const resultado = await db.query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
        const usuario = resultado.rows[0];
        if (!usuario) return res.status(401).json({ erro: 'Credenciais inválidas.' });

        const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
        if (!senhaValida) return res.status(401).json({ erro: 'Credenciais inválidas.' });

        const token = jwt.sign({ id: usuario.id_usuario, tipo: usuario.tipo }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ usuario: { id: usuario.id_usuario, nome: usuario.nome, tipo: usuario.tipo }, token });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro no login.' });
    }
});

app.post('/recuperar', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ erro: 'O e-mail é obrigatório.' });

    try {
        const result = await db.query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
        if (result.rows.length === 0) {
            return res.json({ mensagem: 'Se esse e-mail estiver cadastrado, o link de recuperação foi gerado.' });
        }

        const tokenRecuperacao = jwt.sign({ email: email.toLowerCase().trim() }, SECRET_KEY, { expiresIn: '15m' });

        res.json({
            mensagem: 'No mundo real isso iria para o seu e-mail.',
            linkSimulado: `/nova-senha.html?token=${tokenRecuperacao}`
        });

    } catch (e) {
        res.status(500).json({ erro: 'Erro interno ao processar recuperação.' });
    }
});

app.post('/resetar-senha', async (req, res) => {
    const { token, novaSenha } = req.body;
    
    if (!token || !novaSenha || novaSenha.length < 6) {
        return res.status(400).json({ erro: 'Token inválido ou senha muito curta (mínimo 6 caracteres).' });
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const email = decoded.email;

        const senhaHash = await bcrypt.hash(novaSenha, 10);
        await db.query('UPDATE usuarios SET senha_hash = $1 WHERE email = $2', [senhaHash, email]);

        res.json({ mensagem: 'Senha atualizada com sucesso!' });
    } catch (e) {
        return res.status(400).json({ erro: 'Token inválido ou expirado. Solicite a recuperação novamente.' });
    }
});


// Inicialização do Servidor e Arquivos Estáticos
const pastaPublica = path.resolve(__dirname, '../public');
app.use(express.static(pastaPublica));

const HOST = '0.0.0.0';
app.listen(porta, HOST, () => {
    console.log(`Servidor rodando em http://${HOST}:${porta}`);
});