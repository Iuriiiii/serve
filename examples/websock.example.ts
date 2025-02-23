// server.ts
import { serve } from "../mod.ts";

interface ChatMessage {
  type: "message";
  user: string;
  content: string;
  timestamp: number;
}

interface UserStatus {
  type: "status";
  user: string;
  status: "online" | "offline";
  timestamp: number;
}

type WebSocketMessage = ChatMessage | UserStatus;

// Store connected clients
// deno-lint-ignore no-explicit-any
const clients = new Map<string, { websocket: any; username: string; }>();

const broadcastMessage = (message: WebSocketMessage) => {
  for (const client of clients.values()) {
    client.websocket.send(JSON.stringify(message));
  }
};

const server = await serve({
  port: 8080,
  hostname: "localhost",

  // Handle HTTP requests
  handler({ request, upgradeToWebSocket }) {
    const url = new URL(request.url);

    // Handle WebSocket upgrade requests
    if (url.pathname === "/ws") {
      const username = url.searchParams.get("username");
      if (!username) {
        return new Response("Username required", { status: 400 });
      }

      // Upgrade the connection to WebSocket
      if (upgradeToWebSocket({ username })) {
        return new Response(null, { status: 101 });
      }

      return new Response("WebSocket upgrade failed", { status: 500 });
    }

    // Serve a simple HTML page for non-WebSocket requests
    if (url.pathname === "/") {
      return new Response(
        `
        <!DOCTYPE html>
        <html>
          <head>
            <title>WebSocket Chat</title>
          </head>
          <body>
            <div id="messages"></div>
            <input type="text" id="messageInput" placeholder="Type a message...">
            <button onclick="sendMessage()">Send</button>
            <script>
              const username = prompt("Enter your username:");
              const ws = new WebSocket(\`ws://localhost:8080/ws?username=\${encodeURIComponent(username)}\`);
              const messages = document.getElementById("messages");
              const messageInput = document.getElementById("messageInput");

              ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                const div = document.createElement("div");
                
                if (message.type === "message") {
                  div.textContent = \`\${message.user}: \${message.content}\`;
                } else if (message.type === "status") {
                  div.textContent = \`\${message.user} is \${message.status}\`;
                  div.style.fontStyle = "italic";
                }
                
                messages.appendChild(div);
                messages.scrollTop = messages.scrollHeight;
              };

              function sendMessage() {
                const content = messageInput.value.trim();
                if (content) {
                  ws.send(JSON.stringify({
                    type: "message",
                    content
                  }));
                  messageInput.value = "";
                }
              }

              messageInput.addEventListener("keypress", (e) => {
                if (e.key === "Enter") sendMessage();
              });
            </script>
          </body>
        </html>
      `,
        {
          headers: { "Content-Type": "text/html" },
        },
      );
    }

    return new Response("Not Found", { status: 404 });
  },

  // Handle WebSocket events
  wsHandler({ websocket, event, data, context }) {
    // deno-lint-ignore no-explicit-any
    const username = (context as any).username;

    switch (event) {
      case "open":
        // Store client information
        clients.set(username, { websocket, username });

        // Broadcast user joined
        broadcastMessage({
          type: "status",
          user: username,
          status: "online",
          timestamp: Date.now(),
        });
        break;

      case "message":
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === "message" && typeof parsed.content === "string") {
            // Broadcast the message to all clients
            broadcastMessage({
              type: "message",
              user: username,
              content: parsed.content,
              timestamp: Date.now(),
            });
          }
        } catch (err) {
          console.error("Invalid message format:", err);
        }
        break;

      case "close":
        // Remove client and broadcast departure
        clients.delete(username);
        broadcastMessage({
          type: "status",
          user: username,
          status: "offline",
          timestamp: Date.now(),
        });
        break;
    }
  },
});

console.log(
  `WebSocket server running at ws://${server.addr.hostname}:${server.addr.port}`,
);

// To test the server, you can run it and then open multiple browser windows to
// http://localhost:8080 to create a simple chat room where multiple users can
// communicate with each other.
