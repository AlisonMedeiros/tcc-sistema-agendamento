# Usar imagem leve do Node.js
FROM node:20-alpine

# Definir diretório de trabalho
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências (incluindo as de desenvolvimento se necessário, ou use --production)
RUN npm install

# Copiar o restante da aplicação
COPY . .

# Expõe a porta que a aplicação usa (3000 por padrão)
EXPOSE 3000

# Comando para iniciar o servidor
CMD ["npm", "run", "dev"]
