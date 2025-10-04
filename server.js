// server.js (Revisado para evitar timeout e forçar conexão)
const express = require('express');
const http = require('http'); 
const url = require('url');
const cors = require('cors'); 

const app = express();
const PORT = process.env.PORT || 3000; 

// URL da API externa (HTTP)
const EXTERNAL_API_BASE = 'http://patronhost.online/logs/api_sse.php';

// Permite conexões do Netlify
app.use(cors());

// DESATIVA o timeout do servidor Express a nível da aplicação
app.timeout = 0; 

app.get('/api/logs', (req, res) => {
    
    // Configurações de conexão para o CLIENTE (Netlify)
    req.socket.setTimeout(0); 
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true, 10000); // Força Keep-Alive de 10s

    const queryParam = req.query.url; 
    
    if (!queryParam) {
        return res.status(400).send('Missing "url" query parameter.');
    }

    const targetUrl = `${EXTERNAL_API_BASE}?url=${encodeURIComponent(queryParam)}`;
    const parsedUrl = url.parse(targetUrl);
    
    console.log(`Proxying request to: ${targetUrl}`);

    const options = {
        hostname: parsedUrl.hostname,
        port: 80, // Porta padrão HTTP
        path: parsedUrl.path,
        method: 'GET',
        // Desativa o timeout para a requisição externa
        timeout: 0, 
        headers: {
            'User-Agent': 'Node-Proxy-Service',
            'Connection': 'keep-alive',
            'Host': parsedUrl.hostname 
        }
    };

    // Configura os cabeçalhos SSE para o cliente Netlify
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*' 
    });
    
    // Faz a requisição HTTP para a API externa
    const proxyReq = http.request(options, (proxyRes) => {
        // Quando a API externa envia dados, encaminha para o cliente Netlify
        proxyRes.pipe(res);
        
        // Trata o fechamento da API externa.
        proxyRes.on('end', () => {
             console.log('External API stream ended.');
             res.end();
        });
    });

    // Lida com erros (ex: timeout, DNS)
    proxyReq.on('error', (e) => {
        console.error(`Proxy Request Error: ${e.message}`);
        // Se a resposta ainda não foi enviada, envia erro 500
        if (!res.headersSent) {
             res.writeHead(500, {'Content-Type': 'text/plain'});
        }
        // Envia um evento de erro para o EventSource do cliente
        res.end(`event: error\ndata: {"error":"Failed to connect to external API: ${e.message}"}\n\n`);
    });

    // Aborta a requisição externa se o cliente fechar a conexão
    req.on('close', () => {
        proxyReq.abort(); 
    });

    proxyReq.end();
});

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

// Força o servidor a não ter timeout (medida de segurança final)
server.setTimeout(0);
