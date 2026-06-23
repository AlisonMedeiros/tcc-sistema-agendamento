const fs = require('fs');
const path = require('path');
const db = require('../api/db');
require('dotenv').config();

async function runMigration() {
    console.log('⏳ Lendo o arquivo schema.sql...');
    try {
        const schemaPath = path.join(__dirname, '../docs/schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        console.log('🚀 Criando tabelas no Supabase...');
        await db.query(schemaSql);
        
        console.log('✅ Tabelas criadas com sucesso!');
    } catch (err) {
        console.error('❌ Erro ao criar as tabelas:', err.message);
    } finally {
        process.exit();
    }
}

runMigration();
