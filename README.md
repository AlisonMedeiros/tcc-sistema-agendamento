# Gündem — Sistema de Gestão e Agendamento para Estúdios de Beleza

Este é um sistema de gestão, agendamento autônomo e controle financeiro desenvolvido sob medida para o **Estúdio Débora Braga**, concebido como Trabalho de Conclusão de Curso (TCC) no curso de **Análise e Desenvolvimento de Sistemas**. A solução visa modernizar a marcação de horários (mitigando conflitos e *no-shows*), automatizar o fluxo de caixa, gerar relatórios de consumo e garantir escalabilidade através de uma arquitetura em nuvem otimizada.

**Desenvolvedores:**
* Alison Medeiros - RA: 6324005
* Ronaldo Canavezzi - RA: 6324536

---

## 📑 Sumário

1. [Objetivos](#1-objetivos)
2. [Funcionalidades Principais por Nível de Acesso](#2-funcionalidades-principais-por-nível-de-acesso)
3. [Stack Tecnológica](#3-stack-tecnológica)
4. [Arquitetura de Infraestrutura em Produção](#4-arquitetura-de-infraestrutura-em-produção)
5. [Detalhes da Aplicação e Guia de Deploy](#5-detalhes-da-aplicação-e-guia-de-deploy)
   - [Procedimento de Cleanup, Manutenção e Descarte](#53-procedimento-de-cleanup-manutenção-e-descarte)
6. [Diferenciais de Engenharia](#6-diferenciais-de-engenharia)
7. [Documentação Técnica](#7-documentação-técnica)

---

## 1. Objetivos

O sistema foi desenhado para resolver a desorganização operacional causada pelo uso de cadernos e aplicativos de mensagens informais. Ele permite:
* **Autonomia (Fricção Zero):** Clientes agendam horários 24 horas por dia sem intervenção manual.
* **Previsibilidade Financeira:** Controle de faturamento em tempo real, revertendo as perdas históricas do negócio.
* **Confiabilidade:** Bloqueio automático de concorrência e choques de horário.
* **Segurança e Privacidade:** Conformidade com a LGPD através de mascaramento de dados.

---

## 2. Funcionalidades Principais por Nível de Acesso

### 📱 Portal da Cliente (Frontend PWA)
* **Autoagendamento Dinâmico:** Visualização do catálogo de serviços e reserva instantânea de horários.
* **UX para Pagamentos:** Integração com a *Web Clipboard API* para cópia da chave PIX com 1 clique.
* **Histórico de Serviços:** Acompanhamento do status dos agendamentos (Pendentes, Confirmados, Cancelados).
* **Gestão de Perfil:** Atualização de dados cadastrais e redefinição de senha com *fallback* de e-mail.

### 💻 Painel da Administradora (Dashboard Admin)
* **Visão Estratégica:** Dashboard com gráficos analíticos de faturamento gerados em tempo real.
* **Gestão de Pacotes Mensais:** Agendamento em lote de múltiplas semanas através de processamento transacional.
* **Controle de Portfólio:** CRUD completo de serviços (Criação, edição de preços/duração e inativação).
* **Extratos de Consumo:** Geração de relatórios filtrados em PDF via *Client-Side Processing*.
* **Adequação LGPD:** Exclusão de clientes via *Soft Delete* sem corromper o histórico financeiro.

---

## 3. Stack Tecnológica

O ecossistema foi construído priorizando performance, leveza e segurança:
* **Frontend:** HTML5, CSS3, JavaScript Vanilla (PWA - Progressive Web App), Chart.js.
* **Backend:** Node.js, Express.
* **Banco de Dados:** PostgreSQL.
* **Segurança:** Autenticação Stateless via JWT (JSON Web Tokens) e Hashing via Bcrypt.
* **Infraestrutura / DevOps:** Docker, Docker Compose, Render (PaaS), Supabase (DBaaS).
* **Integrações (APIs):** Resend API (Envio de e-mails transacionais).

---

## 4. Arquitetura de Infraestrutura em Produção

A aplicação transita de um ambiente containerizado local para uma arquitetura "Fully Managed" em nuvem, baseada no Modelo de Responsabilidade Compartilhada.

* **Backend API (Render):** O servidor Node.js é hospedado na Render, com pipeline de Integração e Entrega Contínuas (CI/CD) atrelada à branch `main`.
* **Banco de Dados (Supabase):** Substitui o uso de instâncias EC2/RDS manuais, fornecendo um banco PostgreSQL isolado com *Pooler* de conexões nativo (PgBouncer) e alta resiliência.
* **Resiliência de Rede:** As chamadas para disparo de e-mails ocorrem via HTTPS (porta 443) contornando firewalls que normalmente bloqueiam portas SMTP em provedores Cloud.

---

## 5. Detalhes da Aplicação e Guia de Deploy

O projeto está organizado segundo o padrão de microsserviços lógicos para a avaliação técnica:
* `/web`: Códigos e assets estáticos do Frontend (HTML, CSS, JS).
* `/api`: Código-fonte do servidor Node.js e rotas RESTful.
* `/infra`: Arquivos de orquestração Docker (`Dockerfile` e `docker-compose.yml`).

### 5.1. Orquestração Local com Docker (Trilha A)

Para rodar a aplicação localmente de forma isolada:

1. Clone o repositório:
   ```bash
   git clone [https://github.com/AlisonMedeiros/tcc-sistema-agendamento.git](https://github.com/AlisonMedeiros/tcc-sistema-agendamento.git)
   cd tcc-sistema-agendamento

```

2. Configure as variáveis de ambiente:
Renomeie o arquivo `.env.example` para `.env` e preencha as credenciais. *(Nota: O `.gitignore` previne a exposição deste arquivo)*.
3. Construa e suba a infraestrutura:
```bash
docker-compose up -d --build

```


*O Docker construirá a imagem `node:20-alpine` (otimizada e non-root), subirá o banco PostgreSQL e inicializará a API em `http://localhost:3000`.*

### 5.2. Acesso à Aplicação Local

* **Frontend/Login:** `http://localhost:3000`
* Para testes, utilize o script de seed para criar usuários padrões:
```bash
docker exec -it gudem-app npm run seed

```



---

### 5.3. Procedimento de Cleanup, Manutenção e Descarte

Para garantir a limpeza de recursos ("Cleanup") e evitar o consumo fantasma de memória/disco em sua máquina de desenvolvimento, siga os procedimentos abaixo:

**1. Derrubar a aplicação e limpar a rede local:**

```bash
docker-compose down

```

**2. Destruição Completa (Containers + Dados Persistidos):**
Se for necessário recriar o banco de dados do zero (limpando o volume `gudem_db_data`), execute:

```bash
docker-compose down -v

```

**3. Limpeza Profunda do Sistema Docker (Cuidado):**
Remove todas as imagens, containers parados e cache de build órfãos do seu SO:

```bash
docker system prune -a --volumes

```

---

## 6. Diferenciais de Engenharia

* **Transações ACID (Banco de Dados):** O agendamento de "Pacotes Mensais" utiliza os comandos `BEGIN`, `COMMIT` e `ROLLBACK`. Se houver choque de concorrência na 3ª semana de um pacote, o banco cancela a transação inteira, garantindo zero reservas duplicadas.
* **Segurança no Frontend (Gatekeeper):** Verificação de sessão atrelada ao `<head>` do HTML. O script bloqueia acessos indevidos antes mesmo do navegador renderizar a tela visual (DOM), evitando o "Efeito Flash".
* **Soft Delete e Conformidade LGPD:** Ao excluir uma cliente, o banco mascara os dados e o frontend a oculta da listagem visual. As métricas do Dashboard permanecem intactas, evitando falhas de integridade por violação de Chaves Estrangeiras (Foreign Keys).
* **Graceful Degradation (Fallback de API):** Se a API externa de e-mails (Resend) apresentar indisponibilidade, a nossa API captura a falha de rede (`catch`) e exibe o link seguro de ativação diretamente na tela do usuário, impedindo o travamento da jornada de conversão.

---

## 7. Documentação Técnica

Toda a documentação referente à modelagem e diagramação do sistema encontra-se no diretório `/docs`:

1. **Documento de Fluxo de Dados (DFD)**
2. **Documento de Requisitos Técnicos**
3. **Modelo Entidade-Relacionamento (MER)**
4. **Script de Inicialização do Banco (`schema.sql`)**

```