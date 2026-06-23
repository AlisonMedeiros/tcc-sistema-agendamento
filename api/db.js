const { Pool } = require('pg');
require('dotenv').config();

// ============================================================================
// [INFRAESTRUTURA]: CONEXÃO SUPABASE (POSTGRESQL EM NUVEM) E LOCAL (DOCKER)
// Usamos Pool de conexões para não sobrecarregar o servidor com muitas
// aberturas simultâneas. A lógica abaixo desativa o SSL localmente e ativa na nuvem.
// ============================================================================
const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    // SE O HOST FOR 'db' (DOCKER LOCAL), DESLIGA O SSL. CASO CONTRÁRIO (SUPABASE), LIGA O SSL.
    ssl: process.env.DB_HOST === 'db' ? false : { rejectUnauthorized: false }
});

// Testando a conexão
pool.connect()
    .then(() => console.log(' Banco de dados PostgreSQL conectado com sucesso!'))
    .catch(err => console.error(' Erro ao conectar no banco:', err.stack));

module.exports = pool;