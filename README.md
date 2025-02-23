# @online/serve

A universal HTTP and WebSocket server implementation that works across Node.js, Deno, and Bun runtimes. This package provides a consistent API for serving HTTP requests and handling WebSocket connections regardless of the underlying JavaScript runtime.

## Features

- 🔄 Runtime-agnostic HTTP server implementation
- 🔌 WebSocket support with consistent API across runtimes
- 🔒 TLS/HTTPS support
- ⚡ Native implementation for each runtime (Node.js, Deno, Bun)
- 🎯 TypeScript support
- 🔄 Automatic runtime detection

## Installation

```bash
deno add jsr:@online/serve
```

## Usage

### Basic HTTP Server

```typescript
import { serve } from "@online/serve";

const server = await serve({
  port: 3000,
  async handler({ request }) {
    return new Response("Hello World!");
  },
});

console.log(`Server running at http://${server.addr.hostname}:${server.addr.port}`);
```

### WebSocket Server

```typescript
import { serve, WebsocketEventType } from "@online/serve";

const server = await serve({
  port: 3000,
  
  // Handle HTTP requests
  async handler({ request, upgradeToWebSocket }) {
    if (request.headers.get("upgrade") === "websocket") {
      // Upgrade the connection to WebSocket
      return upgradeToWebSocket({ 
        context: { userId: "123" } // Optional context
      });
    }
    return new Response("This is a WebSocket server");
  },
  
  // Handle WebSocket events
  wsHandler({ websocket, event, data, context }) {
    switch (event) {
      case WebsocketEventType.Open:
        console.log("Client connected", context);
        break;
      case WebsocketEventType.Message:
        console.log("Received:", data);
        websocket.send("Echo: " + data);
        break;
      case WebsocketEventType.Close:
        console.log("Client disconnected");
        break;
    }
  },
});
```

### HTTPS/TLS Support

```typescript
import { serve } from "@online/serve";

const server = await serve({
  port: 443,
  tls: {
    key: "path/to/key.pem",
    cert: "path/to/cert.pem"
  },
  async handler({ request }) {
    return new Response("Secure Hello World!");
  },
});
```

## API Reference

### serve(options: IServeOptions): Promise<IServer>

Main function to create a server instance.

#### IServeOptions

- `handler: (options: IHandlerOptions) => Promise<Response>` - HTTP request handler
- `port?: number` - Port to listen on (default: 0 for random port)
- `hostname?: string` - Hostname to bind to
- `signal?: AbortSignal` - Signal to abort the server
- `tls?: { key: string, cert: string }` - TLS configuration
- `reusePort?: boolean` - Enable SO_REUSEPORT when available
- `wsHandler?: (options: IWebSocketHandlerOptions) => void` - WebSocket event handler

#### IServer

- `close(): Promise<void>` - Stop the server
- `ref(): void` - Keep the event loop alive
- `unref(): void` - Allow the event loop to exit
- `addr: { hostname: string, port: number, transport: "tcp" }` - Server address info

## Development

```bash
# Run tests
deno task test

# Run development server
deno task dev
```

## License

MIT License

## Runtime Compatibility

| Feature          | Node.js | Deno | Bun |
|-----------------|---------|------|-----|
| HTTP Server     | ✅      | ✅   | ✅  |
| WebSocket       | ✅      | ✅   | ✅  |
| TLS Support     | ✅      | ✅   | ✅  |
| Port Reuse      | ✅      | ✅   | ✅  |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.