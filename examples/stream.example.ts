import { type IWebSocketHandlerOptions, serve } from "../mod.ts";

// Create a ReadableStream that emits numbers every second
function createNumberStream() {
  let counter = 0;
  return new ReadableStream({
    start(controller) {
      const interval = setInterval(() => {
        const data = `data: ${counter++}\n\n`;
        controller.enqueue(new TextEncoder().encode(data));

        // Stop after 10 numbers
        if (counter > 10) {
          clearInterval(interval);
          controller.close();
        }
      }, 1000);
    },
  });
}

// Create a transform stream that doubles the numbers
const doubleTransform = new TransformStream({
  transform(chunk, controller) {
    const text = new TextDecoder().decode(chunk);
    const number = parseInt(text.split(": ")[1]);
    if (!isNaN(number)) {
      const doubled = `data: ${number * 2}\n\n`;
      controller.enqueue(new TextEncoder().encode(doubled));
    }
  },
});

// WebSocket handler for streaming data
function handleWebSocket({ websocket, event, data }: IWebSocketHandlerOptions) {
  switch (event) {
    case "open": {
      console.log("WebSocket connected");
      // Start sending numbers every second
      let wsCounter = 0;
      const interval = setInterval(() => {
        if (websocket.readyState() === 1) { // if connection is open
          websocket.send(`Number: ${wsCounter++}`);
          if (wsCounter > 10) {
            clearInterval(interval);
            websocket.close(1000, "Stream complete");
          }
        }
      }, 1000);
      break;
    }
    case "message":
      console.log("Received:", data);
      // Echo back doubled numbers
      if (typeof data === "string") {
        const number = parseInt(data);
        if (!isNaN(number)) {
          websocket.send(`Doubled: ${number * 2}`);
        }
      }
      break;

    case "close":
      console.log("WebSocket closed");
      break;
  }
}

// Start the server
const server = await serve({
  port: 3000,

  // HTTP handler
  handler({ request, upgradeToWebSocket }) {
    const url = new URL(request.url);

    // Handle WebSocket upgrade
    if (url.pathname === "/ws") {
      if (upgradeToWebSocket({})) {
        return new Response(null, { status: 101 });
      }
    }

    // Handle SSE stream
    if (url.pathname === "/stream") {
      const stream = createNumberStream();

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Handle transformed stream
    if (url.pathname === "/double") {
      const stream = createNumberStream()
        .pipeThrough(doubleTransform);

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
      });
    }

    // Serve a simple HTML page
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Streaming Example</title>
        </head>
        <body>
          <h1>Streaming Examples</h1>
          
          <h2>Server-Sent Events (SSE)</h2>
          <div id="sse-output"></div>
          
          <h2>WebSocket</h2>
          <div id="ws-output"></div>
          
          <script>
            // SSE Example
            const sseOutput = document.getElementById('sse-output');
            const eventSource = new EventSource('/stream');
            
            eventSource.onmessage = (event) => {
              const div = document.createElement('div');
              div.textContent = \`Received: \${event.data}\`;
              sseOutput.appendChild(div);
            };
            
            // WebSocket Example
            const wsOutput = document.getElementById('ws-output');
            const ws = new WebSocket(\`ws://\${location.host}/ws\`);
            
            ws.onmessage = (event) => {
              const div = document.createElement('div');
              div.textContent = event.data;
              wsOutput.appendChild(div);
            };
            
            // Send a number every 2 seconds
            let counter = 0;
            const interval = setInterval(() => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(counter++);
                if (counter > 5) {
                  clearInterval(interval);
                }
              }
            }, 2000);
          </script>
        </body>
      </html>
    `,
      {
        headers: {
          "Content-Type": "text/html",
        },
      },
    );
  },

  // WebSocket handler
  wsHandler: handleWebSocket,
});

console.log(`Server running at http://localhost:${server.addr.port}`);

// Handle graceful shutdown
// Deno.addSignalListener("SIGINT", async () => {
//   console.log("\nShutting down server...");
//   await server.close();
//   Deno.exit(0);
// });
// process.on("SIGINT", async () => {
//   console.log("\nShutting down server...");
//   await server.close();
//   process.exit(0);
// });
