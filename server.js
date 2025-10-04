// server.js
const express = require('express');
const http = require('http'); 
const url = require('url');
const cors = require('cors'); // Necessário para permitir chamadas do Netlify

const app = express();
const PORT = process.env.PORT || 3000;

// URL da API externa (que usa HTTP)
const EXTERNAL_API_BASE = 'http://patronhost.online/logs/api_sse.php';

// Configuração do CORS: Permite que seu frontend no Netlify acesse este serviço.
// Se você souber o domínio exato do Netlify (ex: https://lustrous-semifreddo-7c5a8d.netlify.app),
// use-o no lugar do '*', mas '*' é mais fácil para começar.
app.use(cors());

// Rota de Proxy para a API SSE
app.get('/api/logs', (req, res) => {
    // Extrai a query 'url=' do seu frontend (ex: /api/logs?url=gov.br)
    const queryParam = req.query.url; 
    
    if (!queryParam) {
        return res.status(400).send('Missing "url" query parameter.');
    }

    // Monta a URL completa para a API externa (mantendo o HTTP!)
    const targetUrl = `${EXTERNAL_API_BASE}?url=${encodeURIComponent(queryParam)}`;
    const parsedUrl = url.parse(targetUrl);
    
    console.log(`Proxying request to: ${targetUrl}`);

    // Configuração para a requisição HTTP (Servidor Externo)
    const options = {
        hostname: parsedUrl.hostname,
        port: 80, // Porta padrão para HTTP
        path: parsedUrl.path,
        method: 'GET',
        // Adicionando headers para simular o browser e evitar problemas
        headers: {
            'User-Agent': 'Node-Proxy-Service',
            'Connection': 'keep-alive'
        }
    };

    // Define os cabeçalhos SSE para o cliente Netlify (HTTPS)
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        // O CORS é necessário aqui também, para garantir que o navegador não bloqueie o stream.
        'Access-Control-Allow-Origin': '*' 
    });
    
    // Faz a requisição HTTP para a API externa
    const proxyReq = http.request(options, (proxyRes) => {
        // Encaminha o stream de dados para o frontend
        proxyRes.pipe(res);
    });

    // Lida com erros de conexão no servidor externo
    proxyReq.on('error', (e) => {
        console.error(`Proxy Request Error: ${e.message}`);
        // Envia um evento de erro para o cliente SSE
        res.end(`event: error\ndata: {"error":"Failed to connect to external API: ${e.message}"}\n\n`);
    });

    proxyReq.end();
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});