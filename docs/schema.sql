-- Esquema PostgreSQL alinhado ao MER (docs/MER.md)
-- Execute após criar o banco: psql -U usuario -d nome_db -f docs/schema.sql

-- Tipos enumerados (opcional; facilita validação no banco)
DO $$ BEGIN
    CREATE TYPE tipo_usuario AS ENUM ('admin', 'cliente');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE status_agendamento AS ENUM ('marcado', 'confirmado', 'concluido', 'cancelado');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE tipo_lancamento AS ENUM ('entrada', 'saida');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS usuarios (
    id_usuario      SERIAL PRIMARY KEY,
    nome            VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    senha_hash      VARCHAR(255) NOT NULL,
    tipo            tipo_usuario NOT NULL DEFAULT 'admin',
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clientes (
    id_cliente      SERIAL PRIMARY KEY,
    nome            VARCHAR(255) NOT NULL,
    telefone        VARCHAR(20),
    email           VARCHAR(255),
    id_usuario      INTEGER REFERENCES usuarios (id_usuario) ON DELETE SET NULL,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes (telefone);

CREATE TABLE IF NOT EXISTS servicos (
    id_servico      SERIAL PRIMARY KEY,
    nome            VARCHAR(255) NOT NULL,
    descricao       TEXT,
    duracao_minutos INTEGER NOT NULL DEFAULT 60 CHECK (duracao_minutos > 0),
    preco_padrao    NUMERIC(10, 2) NOT NULL DEFAULT 0,
    ativo           BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metodos_pagamento (
    id_metodo_pagamento SERIAL PRIMARY KEY,
    nome                VARCHAR(50) NOT NULL,
    ativo               BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agendamentos (
    id_agendamento   SERIAL PRIMARY KEY,
    id_cliente       INTEGER NOT NULL REFERENCES clientes (id_cliente) ON DELETE RESTRICT,
    id_servico       INTEGER NOT NULL REFERENCES servicos (id_servico) ON DELETE RESTRICT,
    data_hora_inicio TIMESTAMPTZ NOT NULL,
    data_hora_fim    TIMESTAMPTZ NOT NULL,
    status           status_agendamento NOT NULL DEFAULT 'marcado',
    observacoes      TEXT,
    criado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (data_hora_fim > data_hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_inicio ON agendamentos (data_hora_inicio);

CREATE TABLE IF NOT EXISTS lancamentos_financeiros (
    id_lancamento        SERIAL PRIMARY KEY,
    id_agendamento       INTEGER REFERENCES agendamentos (id_agendamento) ON DELETE SET NULL,
    tipo                 tipo_lancamento NOT NULL,
    categoria            VARCHAR(100) NOT NULL, -- ADICIONADO: Categoria do lançamento (ex: 'Serviço', 'Insumos', 'Despesa Fixa')
    descricao            VARCHAR(255) NOT NULL,
    valor                NUMERIC(10, 2) NOT NULL CHECK (valor >= 0),
    data_lancamento      DATE NOT NULL DEFAULT CURRENT_DATE,
    id_metodo_pagamento  INTEGER REFERENCES metodos_pagamento (id_metodo_pagamento) ON DELETE SET NULL,
    criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- DADOS INICIAIS (SEED) PARA TESTAR A API
-- ==========================================

-- 1. Inserir métodos de pagamento
INSERT INTO metodos_pagamento (nome, ativo)
SELECT v.nome, TRUE
FROM (VALUES ('Pix'), ('Dinheiro'), ('Cartão')) AS v(nome)
WHERE NOT EXISTS (SELECT 1 FROM metodos_pagamento mp WHERE mp.nome = v.nome);

-- 2. Inserir serviços padrões
INSERT INTO servicos (nome, descricao, duracao_minutos, preco_padrao, ativo)
SELECT v.nome, v.descricao, v.duracao, v.preco, TRUE
FROM (
    VALUES
        ('Corte', 'Corte de cabelo', 45, 80.00),
        ('Escova', 'Escova modeladora', 60, 120.00),
        ('Coloração', 'Coloração completa', 120, 250.00)
) AS v(nome, descricao, duracao, preco)
WHERE NOT EXISTS (SELECT 1 FROM servicos s WHERE s.nome = v.nome);

-- 3. Inserir Usuários de Teste (Admin e Cliente) -> ADICIONADO AQUI!
INSERT INTO usuarios (nome, email, senha_hash, tipo)
SELECT v.nome, v.email, v.senha, v.tipo::tipo_usuario
FROM (
    VALUES 
        ('Débora Braga', 'admin@gudem.com', '85651286', 'admin'),
        ('Silene Malaquias', 'silene@email.com', '123456', 'cliente')
) AS v(nome, email, senha, tipo)
WHERE NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.email = v.email);