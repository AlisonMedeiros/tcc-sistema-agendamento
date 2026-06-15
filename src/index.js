const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./db');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const SECRET_KEY = process.env.JWT_SECRET || 'gudem_secreto_super_seguro_2026';

// ============================================================================
// [SEGURANÇA / JWT]: AUTENTICAÇÃO STATELESS
// Middleware que intercepta todas as requisições protegidas. 
// O JWT permite validar a identidade sem precisar consultar o banco 
// de dados a cada clique, garantindo alta performance e segurança.
// ============================================================================
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
    // Apenas admins podem deletar
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado.' });

    const { id } = req.params;

    try {
        // 1. Verifica se o serviço já foi utilizado em algum agendamento
        const checkAgendamentos = await db.query('SELECT id_agendamento FROM agendamentos WHERE id_servico = $1 LIMIT 1', [id]);

        if (checkAgendamentos.rows.length > 0) {
            // SOFT DELETE: O serviço já foi usado. Não podemos apagar, então inativamos.
            await db.query('UPDATE servicos SET ativo = FALSE, atualizado_em = NOW() WHERE id_servico = $1', [id]);
            return res.json({ mensagem: 'Este serviço possui histórico de agendamentos e não pode ser apagado, mas foi inativado com sucesso!' });
        } else {
            // HARD DELETE: O serviço nunca foi usado. Pode ser apagado permanentemente do banco.
            await db.query('DELETE FROM servicos WHERE id_servico = $1', [id]);
            return res.json({ mensagem: 'Serviço excluído permanentemente com sucesso!' });
        }

    } catch (erro) {
        console.error('Erro ao excluir serviço:', erro);
        res.status(500).json({ erro: 'Erro interno ao tentar excluir o serviço.' });
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
 * ============================================================================
 * [ARQUITETURA / LGPD]: EXCLUSÃO E SOFT DELETE VISUAL
 * O banco possui chaves estrangeiras. Se apagarmos a cliente, o faturamento
 * some do Dashboard da administradora. Resolvemos isso via engenharia: 
 * Tratamos o erro '23503' (Foreign Key) e usamos abstração no Front-end 
 * para ocultar a "Cliente Removida", mantendo os gráficos financeiros exatos.
 * ============================================================================
 */
app.delete('/clientes/:id', verificarToken, async (req, res) => {
    // Apenas admins podem deletar
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado.' });

    const { id } = req.params;
    const clientPool = await db.connect(); // Puxa uma conexão para fazer a transação dupla

    try {
        await clientPool.query('BEGIN'); // Inicia a transação

        // 1. Descobre se essa cliente tem uma conta de login (id_usuario) atrelada
        const resCli = await clientPool.query('SELECT id_usuario FROM clientes WHERE id_cliente = $1', [id]);
        const id_usuario = (resCli.rows.length > 0) ? resCli.rows[0].id_usuario : null;

        // 2. Tenta deletar a cliente primeiro (Se tiver agendamento, vai dar erro aqui e pular pro CATCH)
        await clientPool.query('DELETE FROM clientes WHERE id_cliente = $1', [id]);

        // 3. Se deu certo deletar a cliente, e ela tinha login, deleta a conta de login (usuário) também!
        if (id_usuario) {
            await clientPool.query('DELETE FROM usuarios WHERE id_usuario = $1', [id_usuario]);
        }

        await clientPool.query('COMMIT'); // Confirma as duas exclusões
        res.json({ mensagem: 'Cliente e conta de acesso excluídos com sucesso!' });

    } catch (erro) {
        await clientPool.query('ROLLBACK'); // Desfaz tudo se der erro

        // O código 23503 é o alerta de Chave Estrangeira do PostgreSQL
        if (erro.code === '23503') {
            res.status(400).json({ erro: 'Não é possível excluir! Esta cliente possui histórico financeiro e apagá-la corromperia as métricas do salão.' });
        } else {
            console.error(erro);
            res.status(500).json({ erro: 'Erro interno ao excluir cliente.' });
        }
    } finally {
        clientPool.release(); // Devolve a conexão
    }
});

/** Relatório de Gastos por Cliente (Admin) */
app.get('/clientes/:id/relatorio', verificarToken, async (req, res) => {
    // Apenas admins podem pedir este relatório
    if (req.usuario.tipo !== 'admin') return res.status(403).json({ erro: 'Acesso negado.' });

    const { id } = req.params;

    try {
        // Busca agendamentos concluídos ou confirmados, com preço
        const resultado = await db.query(`
            SELECT 
                a.data_hora_inicio, 
                s.nome AS servico, 
                COALESCE(l.valor, s.preco_padrao) AS valor
            FROM agendamentos a
            JOIN servicos s ON a.id_servico = s.id_servico
            LEFT JOIN lancamentos_financeiros l ON a.id_agendamento = l.id_agendamento
            WHERE a.id_cliente = $1 AND a.status IN ('confirmado', 'concluido')
            ORDER BY a.data_hora_inicio DESC
        `, [id]);

        res.json(resultado.rows);
    } catch (erro) {
        console.error(erro);
        res.status(500).json({ erro: 'Erro ao gerar relatório da cliente.' });
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
    // ============================================================================
    // [REGRA DE NEGÓCIO]: DEFENSIVE PROGRAMMING (VALIDAÇÃO DE DATA)
    // Aqui garantimos que o usuário não consiga forçar via Postman
    // ou console do navegador um agendamento para uma data 
    // que já passou. Previne a corrupção do histórico da agenda da profissional.
    // ============================================================================
    if (inicio < new Date()) {
        return res.status(400).json({ erro: 'Máquina do tempo bloqueada: Não é possível agendar em horários que já passaram.' });
    }

    const client = await db.connect();
    try {
        // ============================================================================
        // [ENGENHARIA / ACID]: TRANSAÇÕES E INTEGRIDADE RELACIONAL
        // O comando 'BEGIN' trava o banco. Vamos tentar agendar 4 semanas seguidas.
        // Se houver um choque de horário (concorrência) na 3ª semana, o 'ROLLBACK' 
        // no bloco catch desfaz tudo. Ou salva tudo, ou não salva nada (Atomicidade).
        // ============================================================================
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

    if (!nome || !email || !telefone || !senha) {
        return res.status(400).json({ erro: 'Todos os campos são obrigatórios.' });
    }

    try {
        const checkUser = await db.query('SELECT id_usuario FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
        if (checkUser.rows.length > 0) {
            return res.status(400).json({ erro: 'Este e-mail já está em uso.' });
        }
        // ============================================================================
        // [SEGURANÇA / BCRYPT]: CRIPTOGRAFIA IRREVERSÍVEL
        // Aqui geramos um "salt" (ruído criptográfico) e aplicamos o hash.
        // Cumprindo diretrizes de segurança, nem a Débora nem nós (desenvolvedores)
        // temos acesso às senhas em texto puro das clientes no banco de dados.
        // ============================================================================
        const salt = await bcrypt.genSalt(10);
        const hashSenha = await bcrypt.hash(senha, salt);

        const result = await db.query(
            'INSERT INTO usuarios (nome, email, senha_hash, tipo, email_verificado) VALUES ($1, $2, $3, $4, FALSE) RETURNING id_usuario',
            [nome, email.toLowerCase().trim(), hashSenha, 'cliente']
        );
        const novoUsuarioId = result.rows[0].id_usuario;

        await db.query(
            'INSERT INTO clientes (nome, email, telefone, id_usuario) VALUES ($1, $2, $3, $4)',
            [nome, email.toLowerCase().trim(), telefone.trim(), novoUsuarioId]
        );

        // --- GERAÇÃO DO LINK DE ATIVAÇÃO ---
        const tokenAtivacao = jwt.sign({ email: email.toLowerCase().trim() }, SECRET_KEY, { expiresIn: '24h' });
        const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
        const linkAtivacao = `${frontendUrl}/ativar?token=${tokenAtivacao}`;

        let emailEnviadoComSucesso = false;

        // ============================================================================
        // [INTEGRAÇÃO E RESILIÊNCIA]: RESEND API & FALLBACK
        // Não usamos bibliotecas pesadas de SMTP. Fazemos um fetch direto via HTTPS.
        // Além disso, aplicamos o padrão de "Graceful Degradation" (Fallback):
        // Se a API externa de e-mail cair ou falhar, o sistema captura o erro (catch)
        // e devolve o link de ativação simulado na tela, não interrompendo o negócio.
        // ============================================================================
        if (process.env.RESEND_API_KEY) {
            try {
                const resEmail = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: 'Gündem <contato@gundem.com.br>',
                        to: email, 
                        subject: 'Bem-vinda ao Gündem! Confirme seu cadastro',
                        html: `
                            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; text-align: center;">
                                <h2>Olá, ${nome}! 💅</h2>
                                <p>Falta pouco para você poder agendar seus horários com a Débora.</p>
                                <p>Clique no botão abaixo para confirmar seu e-mail e liberar seu acesso:</p>
                                <div style="margin: 30px 0;">
                                    <a href="${linkAtivacao}" style="background-color: #4E295B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Ativar minha Conta</a>
                                </div>
                                <p>Este link é válido por 24 horas.</p>
                            </div>
                        `
                    })
                });

                if (resEmail.ok) {
                    emailEnviadoComSucesso = true;
                } else {
                    const errorData = await resEmail.json().catch(() => ({}));
                    console.error('Falha na API do Resend no Registro:', errorData);
                }
            } catch (errApi) {
                console.error('Erro de rede no envio de e-mail do registro:', errApi.message);
            }
        }

        // Resposta baseada no sucesso do gateway de e-mail
        if (emailEnviadoComSucesso) {
            return res.status(201).json({ 
                mensagem: 'Conta criada! Enviamos um link de ativação para a sua caixa de e-mail.' 
            });
        }

        // --- FALLBACK DE SEGURANÇA (Se o domínio gundem.com.br ainda não estiver pronto) ---
        return res.status(201).json({ 
            mensagem: 'Conta criada com sucesso! (Modo de Teste Ativo)',
            linkSimulado: linkAtivacao
        });

    } catch (e) {
        console.error('Erro geral no registro:', e);
        res.status(500).json({ erro: 'Erro interno ao criar conta.' });
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
        if (result.rows.length === 0) return res.status(404).json({ erro: 'Usuário não encontrado.' });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar perfil.' });
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
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ erro: 'Erro ao atualizar perfil.' });
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
        if (usuario.email_verificado === false) {
            return res.status(403).json({ erro: 'Por favor, acesse seu e-mail e clique no link de ativação antes de entrar.' });
        }

        const token = jwt.sign({ id: usuario.id_usuario, tipo: usuario.tipo }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ usuario: { id: usuario.id_usuario, nome: usuario.nome, tipo: usuario.tipo }, token });
    } catch (erro) {
        res.status(500).json({ erro: 'Erro no login.' });
    }
});

app.post('/recuperar', async (req, res) => {
    const { email, telefone } = req.body;
    if (!email || !telefone) return res.status(400).json({ erro: 'O e-mail e o telefone são obrigatórios.' });

    try {
        const result = await db.query(`
            SELECT u.*, c.telefone 
            FROM usuarios u
            LEFT JOIN clientes c ON c.id_usuario = u.id_usuario
            WHERE u.email = $1
        `, [email.toLowerCase().trim()]);

        if (result.rows.length === 0) {
            return res.status(404).json({ erro: 'O e-mail informado não consta em nosso sistema.' });
        }

        const usuario = result.rows[0];

        // Bloqueio explícito para a conta de Administrador
        if (usuario.tipo === 'admin') {
            return res.status(403).json({ erro: 'Por segurança, contas de administrador não podem redefinir a senha por esta tela.' });
        }

        // Dupla checagem para clientes: O telefone digitado precisa bater com o cadastrado.
        if (!usuario.telefone || usuario.telefone !== telefone.trim()) {
            return res.status(400).json({ erro: 'O Telefone ou E-mail informado não confere com o cadastro.' });
        }
        
        const tokenRecuperacao = jwt.sign({ email: email.toLowerCase().trim() }, SECRET_KEY, { expiresIn: '15m' });

        const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
        const linkRecuperacao = `${frontendUrl}/nova-senha.html?token=${tokenRecuperacao}`;

        // Integração HTTP com a API do Resend (Substitui o SMTP)
        if (process.env.RESEND_API_KEY) {
            try {
                // A função fetch nativa do Node faz a ponte diretamente pela porta 443 (Liberada no Render)
                const resEmail = await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        from: 'Gündem <contato@gundem.com.br>',
                        to: email, // Lembre-se: em contas grátis, este e-mail deve ser o mesmo usado para criar a conta no Resend
                        subject: 'Recuperação de Senha - Gündem',
                        html: `
                            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
                                <h2>Recuperação de Senha</h2>
                                <p>Olá <strong>${usuario.nome}</strong>,</p>
                                <p>Você solicitou a recuperação de senha no nosso sistema. Clique no botão abaixo para definir uma nova senha:</p>
                                <div style="margin: 30px 0;">
                                    <a href="${linkRecuperacao}" style="background-color: #4E295B; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Redefinir Minha Senha</a>
                                </div>
                                <p>Este link é válido por 15 minutos.</p>
                                <p><em>Se você não solicitou a troca de senha, pode ignorar este e-mail.</em></p>
                            </div>
                        `
                    })
                });

                if (resEmail.ok) {
                    return res.json({ mensagem: 'As instruções de recuperação foram enviadas para o seu e-mail!' });
                } else {
                    const errorData = await resEmail.json();
                    console.error('Falha na API do Resend:', errorData);
                    // Se a API falhar, deixamos cair para o Fallback abaixo
                }
            } catch (errApi) {
                console.error('Erro de rede ao contactar o Resend:', errApi.message);
            }
        }

        // --- FALLBACK DE SEGURANÇA (Se não tiver chave ou a API falhar) ---
        return res.json({
            mensagem: 'Simulação: E-mail gerado com sucesso (Modo de Apresentação Ativo):',
            linkSimulado: linkRecuperacao
        });

    } catch (e) {
        console.error('Erro geral ao processar recuperação:', e);
        res.status(500).json({ erro: 'Erro interno ao processar recuperação.' });
    }
});
// RESETAR SENHA (Recebe o token do e-mail e a nova senha)
app.post('/resetar-senha', async (req, res) => {
    const { token, novaSenha } = req.body;

    if (!token || !novaSenha) {
        return res.status(400).json({ erro: 'Token e nova senha são obrigatórios.' });
    }

    try {
        // 1. Verifica se o token é válido e não expirou (15 minutos)
        const decoded = jwt.verify(token, SECRET_KEY);
        const emailToken = decoded.email;

        // 2. Criptografa a nova senha com bcrypt
        const salt = await bcrypt.genSalt(10);
        const hashSenha = await bcrypt.hash(novaSenha, salt);

        // 3. Atualiza a senha no banco de dados
        const result = await db.query(
            'UPDATE usuarios SET senha_hash = $1 WHERE email = $2 RETURNING id_usuario',
            [hashSenha, emailToken]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ erro: 'Usuário não encontrado no sistema.' });
        }

        // 4. Retorna sucesso!
        return res.json({ mensagem: 'Senha atualizada com sucesso! Redirecionando...' });

    } catch (error) {
        console.error('Erro ao resetar senha:', error);
        
        // Tratamento específico se o tempo do token acabou
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ erro: 'O link de recuperação expirou. Solicite um novo e-mail.' });
        }
        
        return res.status(500).json({ erro: 'Erro interno ao atualizar a senha.' });
    }
});
// ATIVAR CONTA (Abre quando a cliente clica no e-mail)
app.get('/ativar', async (req, res) => {
    const token = req.query.token;
    if (!token) return res.send('<h3>Link inválido.</h3>');

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        const emailToken = decoded.email;

        // Muda a coluna no banco para TRUE
        await db.query('UPDATE usuarios SET email_verificado = TRUE WHERE email = $1', [emailToken]);

        const frontendUrl = process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`;
        
        // Redireciona a cliente direto para o login
        res.redirect(`${frontendUrl}/login.html?ativado=true`);

    } catch (error) {
        res.send('<h3>O link expirou ou é inválido. Cadastre-se novamente ou peça suporte.</h3>');
    }
});

// Inicialização do Servidor e Arquivos Estáticos
const pastaPublica = path.resolve(__dirname, '../public');
app.use(express.static(pastaPublica));

const HOST = '0.0.0.0';
app.listen(porta, HOST, () => {
    console.log(`Servidor rodando em http://${HOST}:${porta}`);
});