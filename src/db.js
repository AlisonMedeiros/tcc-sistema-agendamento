const { Pool } = require('pg');
require('dotenv').config();

// ============================================================================
// [INFRAESTRUTURA]: CONEXÃO SUPABASE (POSTGRESQL EM NUVEM)
// Usamos Pool de conexões para não sobrecarregar o servidor com muitas
// aberturas simultâneas. O "ssl: rejectUnauthorized: false" garante a 
// comunicação criptografada entre a Render e o Supabase.
// ============================================================================
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    ssl: { rejectUnauthorized: false }
});

// Testando a conexão
pool.connect()
    .then(() => console.log(' Banco de dados PostgreSQL conectado com sucesso!'))
    .catch(err => console.error(' Erro ao conectar no banco:', err.stack));

module.exports = pool;