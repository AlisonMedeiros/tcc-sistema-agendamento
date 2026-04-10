/**
 * Script de seed: cria os usuários iniciais com senhas criptografadas com bcrypt.
 * Execute com: npm run seed
 * 
 * Usuários criados:
 *   Admin:   admin@gudem.com   / senha: 85651286
 *   Cliente: silene@email.com  / senha: 123456
 */

const bcrypt = require('bcrypt');
const db = require('../src/db');
require('dotenv').config();

const SALT_ROUNDS = 10;

const usuarios = [
    { nome: 'Débora Braga',     email: 'admin@gudem.com',   senha: '123456',   tipo: 'admin'   },
    { nome: 'Silene Malaquias', email: 'silene@email.com',  senha: '123456',   tipo: 'cliente' },
];

async function seed() {
    console.log('🌱 Iniciando seed de usuários...\n');
    try {
        for (const u of usuarios) {
            const hash = await bcrypt.hash(u.senha, SALT_ROUNDS);

            const res = await db.query(
                `INSERT INTO usuarios (nome, email, senha_hash, tipo)
                 VALUES ($1, $2, $3, $4::tipo_usuario)
                 ON CONFLICT (email) DO UPDATE
                    SET senha_hash = EXCLUDED.senha_hash,
                        nome       = EXCLUDED.nome
                 RETURNING id_usuario, nome, email, tipo`,
                [u.nome, u.email, hash, u.tipo]
            );
            console.log(`  ✔ Usuario "${res.rows[0].nome}" (${res.rows[0].tipo}) — OK`);
        }
        console.log('\n✅ Seed concluído com sucesso!');
    } catch (err) {
        console.error('\n❌ Erro durante o seed:', err.message);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

seed();
