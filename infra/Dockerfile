# ============================================================================
# [DEVOPS / RENDER]: CONTEINERIZAÇÃO
# Este arquivo é o "manual de instruções" para a plataforma Render (Cloud).
# Ele baixa a imagem oficial do Node.js 20, instala as dependências do package.json
# e sobe o sistema automaticamente via pipeline do GitHub (CI/CD / Zero Downtime).
# ============================================================================
# 1. Uso obrigatório de imagem base alpine (visando leveza e segurança)
FROM node:20-alpine

# 2. Definição de diretório de trabalho via WORKDIR
WORKDIR /app

# 3. Copia apenas os arquivos de dependência primeiro (Otimização de cache do Docker)
COPY package*.json ./

# 4. Otimização de camadas: Instala dependências nativas (necessárias pro bcrypt no alpine), 
# instala pacotes do node e faz a limpeza obrigatória do cache do gerenciador numa única camada (RUN &&)
RUN apk add --no-cache make gcc g++ python3 && \
    npm install && \
    npm cache clean --force && \
    apk del make gcc g++ python3

# 5. Copia o restante da aplicação
COPY . .

# 6. Segurança: Configuração de usuário não-root (Princípio do menor privilégio)
USER node

# 7. Expõe a porta
EXPOSE 3000

# 8. Comando de inicialização
CMD ["node", "api/index.js"]
