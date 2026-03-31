# Usar imagem completa do Node.js (Debian) para garantir compatibilidade com bcrypt e outras dependências nativas
FROM node:20

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências
RUN npm install

# Copiar o restante da aplicação
COPY . .

# Expõe a porta que a aplicação usa (3000 por padrão)
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["node", "src/index.js"]
