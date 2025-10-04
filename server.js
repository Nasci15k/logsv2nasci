// server.js (Versão Final e Estável para SSE - Chamando HTTPS)
const express = require('express');
const https = require('https'); // AGORA USAMOS HTTPS
const url = require('url');
const cors = require('cors'); 

const app = express();
const PORT = process.env.PORT || 3000; 

// URL da API externa (CORREÇÃO FINAL: INCLUI ?url= no final)
const EXTERNAL_API_BASE = 'https://patronhost.online/logs/api_sse.php?url=';

// Permite conexões do Netlify
app.use(cors());

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

    // 🟢 CORRIGIDO: A URL de destino é o BASE (?url=) + o valor da busca.
    const targetUrl = `${EXTERNAL_API_BASE}${encodeURIComponent(queryParam)}`;
    const parsedUrl = url.parse(targetUrl);
    
    console.log(`Proxying request to: ${targetUrl}`);

    const options = {
        hostname: parsedUrl.hostname,
        port: 443, // Porta padrão HTTPS
        path: parsedUrl.path,
        method: 'GET',
        timeout: 0, 
        headers: {
            'User-Agent': 'Node-Proxy-Service',
            'Connection': 'keep-alive',
            'Host': parsedUrl.hostname,
            'Transfer-Encoding': 'identity'
        }
    };
    
    let sseHeadersSent = false; 

    // Faz a requisição HTTPS
    const proxyReq = https.request(options, (proxyRes) => {
        
        if (proxyRes.statusCode !== 200) {
            
            const errorMsg = `API Externa retornou Status ${proxyRes.statusCode}. Verifique se a API está no ar.`;
            console.error(errorMsg);
            
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Connection': 'close',
                'Access-Control-Allow-Origin': '*' 
            });
            
            res.write(`event: error\ndata: {"error": "${errorMsg}", "status": ${proxyRes.statusCode}}\n\n`);
            return res.end();
        }

        if (!sseHeadersSent) {
            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'Access-Control-Allow-Origin': '*',
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
