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

    // Route xử lý Đăng nhập trực tiếp (Username/Password)
    if (req.url === '/api/local-login' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try {
                const credentials = JSON.parse(body);
                const { login, password } = credentials;
                if (!login || !password) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Thiếu Tên đăng nhập hoặc Mật khẩu!' }));
                    return;
                }

                // Thực hiện gửi request đăng nhập lên Duolingo
                const payload = JSON.stringify({ identifier: login, password });
                const loginOptions = {
                    hostname: 'android-api.duolingo.com',
                    port: 443,
                    path: '/2017-06-30/login',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload),
                        'User-Agent': 'DuolingoMobile/5.105.0 (Android; SDK 30; Scale/2.00)'
                    }
                };

                console.log(`\n\x1b[35m[Proxy Login]\x1b[0m Đang gửi yêu cầu đăng nhập lên Duolingo cho tài khoản: \x1b[36m${login}\x1b[0m...`);

                const duolingoReq = https.request(loginOptions, (duolingoRes) => {
                    let responseData = '';
                    duolingoRes.on('data', chunk => { responseData += chunk; });
                    duolingoRes.on('end', () => {
                        console.log(`\x1b[35m[Proxy Login]\x1b[0m Trạng thái phản hồi từ Duolingo: \x1b[33m${duolingoRes.statusCode}\x1b[0m`);
                        console.log(`\x1b[35m[Proxy Login]\x1b[0m Headers phản hồi từ Duolingo:`, duolingoRes.headers);
                        console.log(`\x1b[35m[Proxy Login]\x1b[0m Body phản hồi từ Duolingo:`, responseData);

                        let jwtToken = '';
                        
                        // 1. Tìm token trong cookies Set-Cookie
                        const setCookieHeaders = duolingoRes.headers['set-cookie'] || [];
                        for (const cookie of setCookieHeaders) {
                            if (cookie.startsWith('jwt_token=')) {
                                jwtToken = cookie.split(';')[0].split('=')[1];
                                break;
                            }
                        }

                        // 2. Tìm trong response body JSON
                        try {
                            const parsed = JSON.parse(responseData);
                            if (parsed.jwt) {
                                jwtToken = parsed.jwt;
                            }
                        } catch (e) {}

                        if (jwtToken) {
                            console.log(`\x1b[32m[Proxy Login] Đăng nhập THÀNH CÔNG! Đã lấy được JWT Token.\x1b[0m`);
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, jwt: jwtToken }));
                        } else {
                            console.error(`\x1b[31m[Proxy Login] Đăng nhập THẤT BẠI! Không tìm thấy JWT Token trong phản hồi.\x1b[0m`);
                            let errorMessage = 'Đăng nhập Duolingo thất bại. Sai mật khẩu hoặc tài khoản!';
                            try {
                                const parsed = JSON.parse(responseData);
                                if (parsed.failure || parsed.message) {
                                    errorMessage = parsed.message || parsed.failure;
                                }
                            } catch (e) {}
                            res.writeHead(401, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: errorMessage }));
                        }
                    });
                });

                duolingoReq.on('error', (err) => {
                    console.error(`\x1b[31m[Proxy Login] Lỗi kết nối HTTPS:\x1b[0m`, err.message);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Lỗi kết nối Duolingo: ' + err.message }));
                });

                duolingoReq.write(payload);
                duolingoReq.end();

            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Dữ liệu yêu cầu không hợp lệ!' }));
            }
        });
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
