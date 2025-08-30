const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const port = process.env.PORT || 5173;
const root = process.cwd();

const mime = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json'
};

const server = http.createServer((req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(root, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404); res.end('Not Found');
    } else {
      const ext = path.extname(filePath);
      res.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
      res.end(data);
    }
  });
});

server.listen(port, () => {
  const url = `http://localhost:${port}/health.html`;
  console.log(`Dev server on ${url}`);
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`, () => {});
});

