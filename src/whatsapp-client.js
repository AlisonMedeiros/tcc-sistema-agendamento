// Cliente de WhatsApp otimizado para o Render usando a API gratuita do CallMeBot
// Veja a documentação em: https://www.callmebot.com/blog/free-api-whatsapp-messages/

/**
 * Função para enviar mensagem via CallMeBot.
 * Ele vai disparar a mensagem SEMPRE para o número configurado no seu .env
 * @param {string} telefoneCliente (Ignorado nesta versão, pois a API envia para o número fixo do salão)
 * @param {string} mensagem O texto da mensagem.
 */
async function enviarMensagem(telefoneCliente, mensagem) {
    // Busca as chaves no seu .env
    const apikey = process.env.CALLMEBOT_APIKEY;
    const phone = process.env.CALLMEBOT_PHONE;

    if (!apikey || !phone) {
        console.warn(' WhatsApp CallMeBot não configurado. Verifique as variáveis CALLMEBOT_APIKEY e CALLMEBOT_PHONE no seu .env.');
        return false;
    }

    try {
        // A API precisa que o texto seja codificado para ir na URL (ex: espaços viram %20)
        const textoCodificado = encodeURIComponent(mensagem);
        const url = `https://api.callmebot.com/whatsapp.php?phone=${phone}&text=${textoCodificado}&apikey=${apikey}`;

        // Faz uma requisição HTTP simples (Super leve, não trava o servidor!)
        const resposta = await fetch(url);

        if (resposta.ok) {
            console.log(' Alerta de WhatsApp enviado com sucesso via CallMeBot!');
            return true;
        } else {
            const erroTexto = await resposta.text();
            console.error(' Falha ao enviar alerta de WhatsApp:', erroTexto);
            return false;
        }
    } catch (error) {
        console.error(' Erro de rede ao tentar usar CallMeBot:', error);
        return false;
    }
}

module.exports = {
    enviarMensagem
};
