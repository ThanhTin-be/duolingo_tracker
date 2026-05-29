const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const server = http.createServer((req, res) => {
    // Cài đặt CORS Headers cho mọi phản hồi
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Requested-With, Accept');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Xử lý preflight request của trình duyệt (OPTIONS)
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Serve static files for the dashboard
    if (req.url === '/' || req.url === '/index.html') {
        const filePath = path.join(__dirname, 'index.html');
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading index.html: ' + err.message);
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(content);
            }
        });
        return;
    }

    if (req.url === '/dashboard.js') {
        const filePath = path.join(__dirname, 'dashboard.js');
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading dashboard.js: ' + err.message);
            } else {
                res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
                res.end(content);
            }
        });
        return;
    }

    if (req.url === '/index.css') {
        const filePath = path.join(__dirname, 'index.css');
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading index.css: ' + err.message);
            } else {
                res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
                res.end(content);
            }
        });
        return;
    }

    if (req.url === '/ui.js') {
        const filePath = path.join(__dirname, 'ui.js');
        fs.readFile(filePath, 'utf8', (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Error loading ui.js: ' + err.message);
            } else {
                res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
                res.end(content);
            }
        });
        return;
    }

    // Tạo URL đích chuyển tiếp tới Duolingo
    const targetHost = 'www.duolingo.com';
    const targetPath = req.url;

    const options = {
        hostname: targetHost,
        port: 443,
        path: targetPath,
        method: req.method,
        headers: {
            ...req.headers,
            host: targetHost,
            connection: 'keep-alive',
        }
    };

    // Ghi đè các header bảo mật thành chính thống của Duolingo để bypass kiểm tra Origin/Referer
    delete options.headers['sec-ch-ua'];
    delete options.headers['sec-ch-ua-mobile'];
    delete options.headers['sec-ch-ua-platform'];
    options.headers['origin'] = 'https://www.duolingo.com';
    options.headers['referer'] = 'https://www.duolingo.com/';

    // Thực hiện request HTTPS tới máy chủ Duolingo
    const proxyReq = https.request(options, (proxyRes) => {
        // Trả kết quả về cho client cùng với CORS Headers
        res.writeHead(proxyRes.statusCode, {
            ...proxyRes.headers,
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
            'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Requested-With, Accept'
        });
        
        proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
        console.error('Lỗi Proxy:', err.message);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Proxy Error: ' + err.message);
    });

    // Đọc dữ liệu request body (nếu có, ví dụ POST/PUT) và ghi vào proxy request
    req.pipe(proxyReq);
});

server.listen(PORT, () => {
    console.log(`\x1b[32m[Duolingo CORS Proxy]\x1b[0m Máy chủ đang chạy tại \x1b[36mhttp://localhost:${PORT}\x1b[0m`);
    console.log(`\x1b[33m[Trực quan]\x1b[0m Đã tự động cấu hình bypass CORS cho các request tới www.duolingo.com!`);
    console.log(`\x1b[90mBấm Ctrl + C để dừng Proxy server.\x1b[0m`);
});
