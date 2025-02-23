import { assertEquals, assertExists, test } from "@inspatial/test";
import { serve } from "../mod.ts";

test("WebSocket basic send and receive functionality", async () => {
  const port = 8100;
  const messageToSend = "Hello WebSocket";
  let receivedMessage = "";

  using _ = await serve({
    port,
    handler: ({ upgradeToWebSocket }) => {
      upgradeToWebSocket({ message: "test context" });
      return new Response(null, { status: 101 });
    },
    wsHandler: ({ event, data, websocket }) => {
      if (event === "message") {
        receivedMessage = data;
        websocket.send("Message received!");
      }
    },
  });

  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise((resolve) => ws.addEventListener("open", resolve));

  ws.send(messageToSend);
  await new Promise((resolve) => ws.addEventListener("message", resolve));

  assertEquals(receivedMessage, messageToSend);
  ws.close();
});

test("WebSocket readyState transitions", async () => {
  const port = 8101;
  // deno-lint-ignore no-explicit-any
  let _serverSocket: any;

  using _ = await serve({
    port,
    handler: ({ upgradeToWebSocket }) => {
      upgradeToWebSocket({});
      return new Response(null, { status: 101 });
    },
    wsHandler: ({ event, websocket }) => {
      if (event === "open") {
        _serverSocket = websocket;
        // Should be OPEN (1)
        assertEquals(websocket.readyState(), 1);
      }
    },
  });

  const ws = new WebSocket(`ws://localhost:${port}`);
  // Should be CONNECTING (0)
  assertEquals(ws.readyState, 0);

  await new Promise((resolve) => ws.addEventListener("open", resolve));
  // Should be OPEN (1)
  assertEquals(ws.readyState, 1);

  ws.close();
  await new Promise((resolve) => ws.addEventListener("close", resolve));
  // Should be CLOSED (3)
  assertEquals(ws.readyState, 3);
});

test("WebSocket close with code and reason", async () => {
  const port = 8102;
  const closeCode = 4000;
  const closeReason = "Custom close reason";
  let receivedCode: number | undefined;
  let receivedReason = "";

  using _ = await serve({
    port,
    handler: ({ upgradeToWebSocket }) => {
      upgradeToWebSocket({});
      return new Response(null, { status: 101 });
    },
    wsHandler: ({ event, websocket }) => {
      if (event === "open") {
        // Close the connection from server side
        websocket.close(closeCode, closeReason);
      }
    },
  });

  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise((resolve) => ws.addEventListener("open", resolve));

  await new Promise((resolve) => {
    ws.addEventListener("close", (event) => {
      receivedCode = event.code;
      receivedReason = event.reason;
      resolve(undefined);
    });
  });

  assertEquals(receivedCode, closeCode);
  assertEquals(receivedReason, closeReason);
});

test("WebSocket bufferedAmount tracking", async () => {
  const port = 8103;
  // deno-lint-ignore no-explicit-any
  let serverSocket: any;
  const largeMessage = "x".repeat(1024 * 1024); // 1MB message

  using _ = await serve({
    port,
    handler: ({ upgradeToWebSocket }) => {
      upgradeToWebSocket({});
      return new Response(null, { status: 101 });
    },
    wsHandler: ({ event, websocket }) => {
      if (event === "open") {
        serverSocket = websocket;
      }
    },
  });

  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise((resolve) => ws.addEventListener("open", resolve));

  // Send large message and check buffered amount
  serverSocket.send(largeMessage);
  const bufferedAmount = serverSocket.getBufferedAmount();
  assertExists(bufferedAmount);
  assertEquals(bufferedAmount >= 0, true);

  ws.close();
});

test("WebSocket binaryType handling", async () => {
  const port = 8104;
  // deno-lint-ignore no-explicit-any
  let serverSocket: any;

  using _ = await serve({
    port,
    handler: ({ upgradeToWebSocket }) => {
      upgradeToWebSocket({});
      return new Response(null, { status: 101 });
    },
    wsHandler: ({ event, websocket }) => {
      if (event === "open") {
        serverSocket = websocket;
        // Check server-side binaryType
        assertExists(websocket.binaryType);
      }
    },
  });

  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise((resolve) => ws.addEventListener("open", resolve));

  // Test different binary types
  const testData = new Uint8Array([1, 2, 3, 4, 5]);

  // Test ArrayBuffer
  ws.binaryType = "arraybuffer";
  serverSocket.send(testData);
  const arrayBufferMsg = await new Promise((resolve) => {
    ws.addEventListener("message", (event) => resolve(event.data), {
      once: true,
    });
  });
  assertEquals(arrayBufferMsg instanceof ArrayBuffer, true);

  // Test Blob
  // ws.binaryType = "blob";
  // serverSocket.send(testData);
  // const blobMsg = await new Promise((resolve) => {
  //   ws.addEventListener("message", (event) => resolve(event.data), { once: true });
  // });
  // assertEquals(blobMsg instanceof Blob, true);

  ws.close();
});

test("WebSocket multiple concurrent connections", async () => {
  const port = 8105;
  const connectedClients = new Set();

  using _ = await serve({
    port,
    handler: ({ upgradeToWebSocket }) => {
      upgradeToWebSocket({});
      return new Response(null, { status: 101 });
    },
    wsHandler: ({ event, websocket }) => {
      if (event === "open") {
        connectedClients.add(websocket);
      } else if (event === "close") {
        connectedClients.delete(websocket);
      } else if (event === "message") {
        // Broadcast to all other clients
        for (const client of connectedClients) {
          if (client !== websocket) {
            // @ts-ignore: .
            client.send("Broadcast message");
          }
        }
      }
    },
  });

  // Create multiple WebSocket connections
  const ws1 = new WebSocket(`ws://localhost:${port}`);
  const ws2 = new WebSocket(`ws://localhost:${port}`);
  const ws3 = new WebSocket(`ws://localhost:${port}`);

  await Promise.all([
    new Promise((resolve) => ws1.addEventListener("open", resolve)),
    new Promise((resolve) => ws2.addEventListener("open", resolve)),
    new Promise((resolve) => ws3.addEventListener("open", resolve)),
  ]);

  assertEquals(connectedClients.size, 3);

  // Clean up
  ws1.close();
  ws2.close();
  ws3.close();
});
