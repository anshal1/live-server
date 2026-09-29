#!/usr/bin/env node

import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";

const clients = new Set();
const root = process.cwd() + "/test";

async function watchFiles(path) {
  const watcher = fs.watch(path, { recursive: true });
  for await (const event of watcher) {
    console.log(event.eventType, event.filename);
    for (const client of clients) {
      client.write(`data: ${event.filename}\n\n`);
    }
  }
}

watchFiles(root);
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let filePath = path.join(
    root,
    url.pathname === "/" ? "index.html" : url.pathname,
  );

  if (url.pathname === "/__live_reload") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    clients.add(res);
    req.on("close", () => {
      res.end();
      clients.delete(res);
    });
    return;
  }

  try {
    let content = await fs.readFile(filePath);

    if (filePath.endsWith(".html")) {
      content = content.toString();
      const reloadscript = `const events = new EventSource('/__live_reload')

      events.onmessage = event => {
          if(event.data.endsWith(".html") || event.data.endsWith(".js")){
            location.reload();
            return
          }
          if(event.data.endsWith(".css")){
            const all = document.querySelectorAll('link[rel="stylesheet"]');
            for(const link of all){
             const url = new URL(link.href)
             url.searchParams.set("t", Date.now().toString())
             link.href = url.toString()
            }
          }
      }
      events.onerror = error => {
        console.error(error)
      }
      `;
      content = content.replace(
        "</body>",
        `<script>${reloadscript}</script></body>`,
      );
    }

    res.writeHead(200);
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});

server.listen(3000, () => {
  console.log("Server is running on port 3000");
});
