// server.js (Versão Final e Estável para SSE)
const express = require('express');
const http = require('http'); 
const url = require('url');
const cors = require('cors'); 

const app = express();
const PORT = process.env.PORT || 3000; 

// URL da API externa (que usa HTTP)
const EXTERNAL_API_BASE = 'http://patronhost.online/logs/api_sse.php';

// Permite conexões do Netlify
app.use(cors());

// Desativa o timeout do servidor Express
// Removemos a linha problemática do 'compress'
app.timeout = 0; 

app.get('/api/logs', (req, res) => {
    
    // Configurações de conexão de rede para o CLIENTE (Netlify)
    req.socket.setTimeout(0); 
    req.socket.setNoDelay(true);
    req.socket.setKeepAlive(true, 10000); 

    const queryParam = req.query.url; 
    
    if (!queryParam) {
        return res.status(400).send('Missing "url" query parameter.');
    }

    const targetUrl = `${EXTERNAL_API_BASE}?url=${encodeURIComponent(queryParam)}`;
    const parsedUrl = url.parse(targetUrl);
    
    console.log(`Proxying request to: ${targetUrl}`);

    const options = {
        hostname: parsedUrl.hostname,
        port: 80, 
        path: parsedUrl.path,
        method: 'GET',
        timeout: 0, 
        headers: {
            'User-Agent': 'Node-Proxy-Service',
            'Connection': 'keep-alive',
            'Host': parsedUrl.hostname,
            // Importante: Desativa a codificação de transferência para streams
            'Transfer-Encoding': 'identity'
        }
    };
    
    let sseHeadersSent = false; 

    const proxyReq = http.request(options, (proxyRes) => {
        
        // 🚨 VERIFICAÇÃO DE STATUS HTTP
        if (proxyRes.statusCode !== 200) {
            
            const errorMsg = `API Externa retornou Status ${proxyRes.statusCode}.`;
            console.error(errorMsg);
            
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Connection': 'close',
                'Access-Control-Allow-Origin': '*' 
            });
            
            res.write(`event: error\ndata: {"error": "${errorMsg}", "status": ${proxyRes.statusCode}}\n\n`);
            return res.end();
        }

        // 🟢 SE O STATUS FOR 200, FORÇA OS CABEÇALHOS SSE NA RESPOSTA
        if (!sseHeadersSent) {
            res.writeHead(200, {
                // Essenciais para SSE
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
                // Prevê qualquer interferência de Express/Node
                'Transfer-Encoding': 'identity' 
            });
            sseHeadersSent = true;
        }

        // Passa o stream de dados RAW
        proxyRes.pipe(res);
        
        proxyRes.on('end', () => {
             console.log('External API stream ended.');
             if (sseHeadersSent) {
                 res.end();
             }
        });
    });

    // Lida com erros (ex: timeout, DNS)
    proxyReq.on('error', (e) => {
        console.error(`Proxy Request Error: ${e.message}`);
        
        if (!sseHeadersSent) {
             res.writeHead(200, {'Content-Type': 'text/event-stream', 'Connection': 'close', 'Access-Control-Allow-Origin': '*'});
             res.write(`event: error\ndata: {"error":"Falha na conexão com o servidor externo: ${e.message}"}\n\n`);
        }
        res.end();
    });

    req.on('close', () => {
        proxyReq.abort(); 
    });

    proxyReq.end();
});

const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

server.setTimeout(0);
