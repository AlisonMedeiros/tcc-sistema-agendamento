const { Pool } = require('pg');
require('dotenv').config();

// Configurando a conexão usando as senhas do seu .env
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME
});

// Testando a conexão
pool.connect()
    .then(() => console.log(' Banco de dados PostgreSQL conectado com sucesso!'))
    .catch(err => console.error(' Erro ao conectar no banco:', err.stack));

module.exports = pool;