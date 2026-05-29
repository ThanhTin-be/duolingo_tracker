const https = require('https');
const urlModule = require('url');

module.exports = async (req, res) => {
    // Cài đặt CORS Headers cho phép client-side fetch thành công trên Vercel
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    // Xử lý Preflight request của trình duyệt (OPTIONS)
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Lấy query path chuyển tiếp
    const { path } = req.query;
    if (!path) {
        res.status(400).json({ error: 'Missing target path parameter' });
        return;
    }

    // Tái cấu trúc URL đích đến Duolingo
    const cleanedPath = path.startsWith('/') ? path : '/' + path;
    const targetUrl = `https://www.duolingo.com${cleanedPath}`;

    // Forward header Authorization chứa Token JWT nếu có
    const headers = {};
    if (req.headers['authorization']) {
        headers['Authorization'] = req.headers['authorization'];
    }
    // Gửi User-Agent giả lập trình duyệt để tránh bị chặn
    headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    try {
        const parsedUrl = urlModule.parse(targetUrl);
        const options = {
            hostname: parsedUrl.hostname,
            path: parsedUrl.path,
            method: 'GET',
            headers: headers
        };

        https.get(options, (proxyRes) => {
            // Thiết lập mã HTTP Status tương tự của Duolingo trả về
            res.status(proxyRes.statusCode);

            // Forward content-type để trình duyệt parse JSON chính xác
            if (proxyRes.headers['content-type']) {
                res.setHeader('Content-Type', proxyRes.headers['content-type']);
            }

            // Pipe luồng dữ liệu thô thẳng về cho client
            proxyRes.pipe(res);
        }).on('error', (err) => {
            console.error('Serverless Proxy Error:', err);
            res.status(500).json({ error: err.message });
        });
    } catch (err) {
        console.error('Serverless Catch Error:', err);
        res.status(500).json({ error: err.message });
    }
};
