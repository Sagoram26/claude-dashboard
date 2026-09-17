import { createServer as createHttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

export async function createServer(port: number): Promise<{
  close: () => Promise<void>;
  port: number;
}> {
  const http = createHttpServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => http.listen(port, '127.0.0.1', resolve));
  const bound = http.address() as AddressInfo;

  return {
    port: bound.port,
    close: () => new Promise<void>((resolve, reject) =>
      http.close((err) => (err ? reject(err) : resolve()))
    ),
  };
}

const isEntrypoint = process.argv[1]?.endsWith('index.ts');
if (isEntrypoint) {
  const server = await createServer(4317);
  console.log(`server listening on http://127.0.0.1:${server.port}`);
}
