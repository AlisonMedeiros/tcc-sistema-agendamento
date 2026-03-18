# Modelo Entidade–Relacionamento (MER) – Sistema de Agendamento e Gestão

Este documento apresenta o Modelo Entidade–Relacionamento (MER) do sistema de agendamento e gestão do Estúdio Débora Braga, com foco em três áreas principais: autoagendamento pelas clientes, gestão da agenda pela profissional e controle financeiro básico. O módulo de controle de estoque **não** faz parte deste modelo.

---

## Visão Geral do MER

O MER foi construído a partir dos requisitos levantados, buscando representar as principais informações manipuladas pelo sistema e os relacionamentos entre elas. As entidades centrais são:

- `USUARIOS`
- `CLIENTES`
- `SERVICOS`
- `AGENDAMENTOS`
- `METODOS_PAGAMENTO`
- `LANCAMENTOS_FINANCEIROS`

---

## Entidades e Atributos

### Entidade: USUARIOS

Representa os usuários que acessam o sistema (ex.: administradora do estúdio e, opcionalmente, clientes com login).

- **Atributos**:
  - `id_usuario` (PK)
  - `nome`
  - `email` (único)
  - `senha_hash`
  - `tipo` (ex.: `admin`, `cliente`)
  - `criado_em`
  - `atualizado_em`

---

### Entidade: CLIENTES

Representa as pessoas atendidas pelo estúdio.

- **Atributos**:
  - `id_cliente` (PK)
  - `nome`
  - `telefone`
  - `email`
  - `id_usuario` (FK para `USUARIOS.id_usuario`, opcional)
  - `criado_em`
  - `atualizado_em`

---

### Entidade: SERVICOS

Representa os tipos de serviços oferecidos pelo estúdio (ex.: escova, maquiagem).

- **Atributos**:
  - `id_servico` (PK)
  - `nome`
  - `descricao`
  - `duracao_minutos`
  - `preco_padrao`
  - `ativo` (booleano)
  - `criado_em`
  - `atualizado_em`

---

### Entidade: AGENDAMENTOS

Representa cada reserva de horário na agenda.

- **Atributos**:
  - `id_agendamento` (PK)
  - `id_cliente` (FK para `CLIENTES.id_cliente`)
  - `id_servico` (FK para `SERVICOS.id_servico`)
  - `data_hora_inicio`
  - `data_hora_fim`
  - `status` (ex.: `marcado`, `confirmado`, `concluido`, `cancelado`)
  - `observacoes`
  - `criado_em`
  - `atualizado_em`

---

### Entidade: METODOS_PAGAMENTO

Representa as formas de pagamento aceitas.

- **Atributos**:
  - `id_metodo_pagamento` (PK)
  - `nome` (ex.: Dinheiro, Pix, Cartão de Crédito)
  - `ativo` (booleano)

---

### Entidade: LANCAMENTOS_FINANCEIROS

Representa os movimentos financeiros (entradas e saídas).

- **Atributos**:
  - `id_lancamento` (PK)
  - `id_agendamento` (FK para `AGENDAMENTOS.id_agendamento`, opcional)
  - `tipo` (`entrada` ou `saida`)
  - `descricao`
  - `valor`
  - `data_lancamento`
  - `id_metodo_pagamento` (FK para `METODOS_PAGAMENTO.id_metodo_pagamento`)
  - `criado_em`
  - `atualizado_em`

---

## Relacionamentos

### 1. USUARIOS – CLIENTES

- **Relacionamento**: um usuário pode estar associado a zero ou muitos clientes (na prática, normalmente 0 ou 1).
- **Cardinalidade**:
  - `USUARIOS` 1 —— N `CLIENTES`
- **Implementação**:
  - `CLIENTES.id_usuario` → FK para `USUARIOS.id_usuario` (opcional)

### 2. CLIENTES – AGENDAMENTOS

- **Relacionamento**: um cliente pode possuir vários agendamentos.
- **Cardinalidade**:
  - `CLIENTES` 1 —— N `AGENDAMENTOS`
- **Implementação**:
  - `AGENDAMENTOS.id_cliente` → FK para `CLIENTES.id_cliente`

### 3. SERVICOS – AGENDAMENTOS

- **Relacionamento**: um serviço pode aparecer em vários agendamentos.
- **Cardinalidade**:
  - `SERVICOS` 1 —— N `AGENDAMENTOS`
- **Implementação**:
  - `AGENDAMENTOS.id_servico` → FK para `SERVICOS.id_servico`

### 4. AGENDAMENTOS – LANCAMENTOS_FINANCEIROS

- **Relacionamento**: um agendamento pode originar um ou mais lançamentos financeiros (por exemplo, recebimento e ajuste).
- **Cardinalidade**:
  - `AGENDAMENTOS` 1 —— N `LANCAMENTOS_FINANCEIROS`
- **Implementação**:
  - `LANCAMENTOS_FINANCEIROS.id_agendamento` → FK para `AGENDAMENTOS.id_agendamento` (campo opcional)

### 5. METODOS_PAGAMENTO – LANCAMENTOS_FINANCEIROS

- **Relacionamento**: um método de pagamento pode ser utilizado em vários lançamentos.
- **Cardinalidade**:
  - `METODOS_PAGAMENTO` 1 —— N `LANCAMENTOS_FINANCEIROS`
- **Implementação**:
  - `LANCAMENTOS_FINANCEIROS.id_metodo_pagamento` → FK para `METODOS_PAGAMENTO.id_metodo_pagamento`

---

## Observações de Projeto

- O modelo foi pensado para **não incluir controle de estoque**, concentrando-se exclusivamente nos processos de autoagendamento, gestão de agenda e registro financeiro.
- A presença de campos de auditoria (`criado_em`, `atualizado_em`) facilita consultas históricas e rastreabilidade das informações.
- O vínculo entre `USUARIOS` e `CLIENTES` permite unificar, quando necessário, a visão de quem acessa o sistema e de quem é atendido no estúdio, evitando duplicidade de cadastros.

