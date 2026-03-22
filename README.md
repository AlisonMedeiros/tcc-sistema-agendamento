# Sistema de Agendamento e Gestão - Güdem

Repositório oficial do Trabalho de Conclusão de Curso (TCC) do curso de Análise e Desenvolvimento de Sistemas.

## Desenvolvedores
* Alison Medeiros - RA: 6324005
* Ronaldo Canavezzi - RA: 6324536

## Sobre o Projeto
Este sistema tem como objetivo principal modernizar e otimizar a gestão do Estúdio de Beleza da profissional autônoma Débora Braga. O projeto propõe a substituição dos processos manuais e informais de agendamento por uma plataforma digital integrada, que contempla os seguintes módulos:

* **Módulo de Autoagendamento:** Interface voltada para as clientes, permitindo a visualização de disponibilidade e marcação remota de horários.
* **Módulo de Gestão de Agenda:** Painel administrativo para a profissional, possibilitando a parametrização de serviços, duração de atendimentos e bloqueio de horários.
* **Módulo de Controle Financeiro:** Sistema de registro de transações (entradas e saídas), métodos de pagamento e fluxo de caixa.

## Documentação Técnica
Toda a documentação referente à engenharia de requisitos e modelagem do sistema encontra-se no diretório `/docs`:
1. Solicitação de Desenvolvimento do Sistema (considerando módulos de autoagendamento, gestão de agenda e controle financeiro, **sem** controle de estoque).
2. Documento de Requisitos Técnicos, atualizado para refletir apenas os módulos de agenda e financeiro.
3. Modelo Entidade-Relacionamento (MER), modelando entidades como clientes, serviços, agendamentos e registros financeiros, sem tabelas de estoque.
4. Documento de Fluxo de Dados (DFD), focado nos fluxos de agendamento, confirmação de atendimento e registro financeiro.
5. Planejamento de Sprints e Backlog do Produto, priorizando funcionalidades ligadas ao agendamento e ao controle financeiro.

## Tecnologias e Ferramentas
* **Controle de versão:** Git e GitHub  
* **Banco de dados:** PostgreSQL  
* **Backend:** Node.js com Express (`src/index.js`)  
* **Frontend:** HTML, CSS e JavaScript (`index.html`, `style.css`)

## Como executar localmente

1. **Instalar dependências**
   ```bash
   npm install
   ```

2. **Configurar o banco**  
   - Crie um banco vazio no PostgreSQL.  
   - Copie `.env.example` para `.env` e ajuste usuário, senha, host, porta e nome do banco.  
   - Aplique o esquema alinhado ao MER:
   ```bash
   psql -U seu_usuario -d nome_do_banco -f docs/schema.sql
   ```

3. **Subir a API (e servir o front na mesma origem)**
   ```bash
   npm run dev
   ```
   - Abra no navegador: **http://localhost:3000/index.html**  
   - A rota **GET /** devolve um JSON de boas-vindas com a lista de endpoints.

### Endpoints principais da API

| Método | Caminho | Descrição |
|--------|---------|-----------|
| GET | `/servicos` | Lista serviços ativos |
| GET | `/pagamentos` | Lista métodos de pagamento ativos |
| GET | `/agendamentos` | Lista últimos agendamentos (parâmetro opcional `limite`) |
| POST | `/agendar` | Cria cliente (se preciso), agendamento e, opcionalmente, lançamento financeiro |

> Se ainda tiver uma base antiga com colunas diferentes (`data_hora`, `id_metodo`, etc.), recrie o banco ou migre as tabelas para o modelo em `docs/schema.sql`.