import {
  assertEquals,
  assertObjectMatch,
  assertRejects,
  test,
} from "@inspatial/test";
import { serve } from "../mod.ts";

test("Normal response", async () => {
  const textToResponse = "Hello world";
  using _ = await serve({
    port: 8081,
    handler: () => new Response(textToResponse),
  });

  await fetch("http://localhost:8081")
    .then((response) => response.text())
    .then((text) => {
      assertEquals(text, textToResponse);
    });
});

test("POST request with JSON body", async () => {
  const requestBody = { message: "Hello server" };
  const port = 8082;

  using _ = await serve({
    port,
    handler: async ({ request }) => {
      const body = await request.json();
      assertObjectMatch(body, requestBody);
      return new Response(JSON.stringify({ received: body }));
    },
  });

  const response = await fetch(`http://localhost:${port}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const responseBody = await response.json();
  assertObjectMatch(responseBody, { received: requestBody });
});

test("WebSocket connection", async () => {
  const port = 8083;
  const messageToSend = "Hello WebSocket";
  let receivedMessage = "";

  using _ = await serve({
    port,
    handler: ({ upgradeToWebSocket }) => {
      if (upgradeToWebSocket({ message: "test context" })) {
        return new Response(null, { status: 101, statusText: "", headers: {} });
      }

      return new Response("Unable to upgrade", { status: 500 });
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

test("Server abort signal", async () => {
  const port = 8084;
  const controller = new AbortController();

  using _ = await serve({
    port,
    handler: () => new Response("Hello"),
    signal: controller.signal,
  });

  // First request should succeed
  const response1 = await fetch(`http://localhost:${port}`);
  await response1.text();
  assertEquals(response1.status, 200);

  // Abort the server
  controller.abort();

  // Subsequent request should fail
  await assertRejects(
    () => fetch(`http://localhost:${port}`),
  );
});

test("Custom headers", async () => {
  const port = 8085;
  const customHeaders = {
    "X-Custom-Header": "test-value",
    "Content-Type": "application/json",
  };

  using _ = await serve({
    port,
    handler: () =>
      new Response(JSON.stringify({ ok: true }), {
        headers: customHeaders,
      }),
  });

  const response = await fetch(`http://localhost:${port}`);
  await response.body?.cancel();

  for (const [key, value] of Object.entries(customHeaders)) {
    assertEquals(response.headers.get(key), value);
  }

});

test("Custom Status Code", async () => {
  const port = 8086;
  using _ = await serve({
    port,
    handler: () => {
      return new Response(null, { status: 500 });
    },
  });

  const response = await fetch(`http://localhost:${port}`);
  await response.text();
  assertEquals(response.status, 500);
});

// Test streaming response
test("Streaming response", async () => {
  const port = 8087;
  const encoder = new TextEncoder();

  // Create a stream with a timeout to prevent hanging
  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(encoder.encode("chunk 1\n"));
        await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay between chunks
        controller.enqueue(encoder.encode("chunk 2\n"));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  using _ = await serve({
    port,
    handler: () =>
      new Response(stream, {
        headers: {
          "Content-Type": "text/plain",
          "Transfer-Encoding": "chunked",
        },
      }),
  });

  const response = await fetch(`http://localhost:${port}`);
  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let result = "";
  let timer;

  if (!reader) {
    throw new Error("No reader available");
  }

  // Read with timeout
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Stream reading timeout")), 1000);
  });

  try {
    while (true) {
      // @ts-ignore: unknown values
      const { done, value } = await Promise.race([
        reader.read(),
        timeout,
      ]);

      if (done) {
        break;
      }

      result += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }

  clearTimeout(timer);
  assertEquals(result.trim().split("\n").length, 2);
  assertEquals(result.includes("chunk 1"), true);
  assertEquals(result.includes("chunk 2"), true);
});
