// server.ts
import { serve } from "../mod.ts";

// Start the server
serve({
  async handler({ request }) {
    // Check if this is a streaming request
    if (request.headers.get("transfer-encoding") === "chunked") {
      let totalSize = 0;
      const decoder = new TextDecoder();
      // Process the incoming stream
      const reader = request.body?.getReader();

      if (!reader) {
        return new Response("No stream provided", { status: 400 });
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Process each chunk
          const chunk = decoder.decode(value);
          totalSize += chunk.length;
          console.log("Received chunk:", chunk);
        }

        return new Response(`Successfully processed ${totalSize} bytes`);
      } catch (error) {
        console.error("Error processing stream:", error);
        return new Response("Error processing stream", { status: 500 });
      }
    }

    return new Response("Not a streaming request", { status: 400 });
  },
  port: 3000,
}).then((server) => {
  console.log(
    `Server running at http://${server.addr.hostname}:${server.addr.port}`,
  );
});

// client.ts
async function streamData() {
  // Create a stream of data
  const stream = new ReadableStream({
    async start(controller) {
      const data = ["Hello", "World", "This", "Is", "A", "Stream"];

      // Simulate streaming data with delays
      for (const chunk of data) {
        controller.enqueue(new TextEncoder().encode(chunk + "\n"));
        // Wait 500ms between chunks to simulate real-time data
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      controller.close();
    },
  });

  try {
    // Send the stream to the server
    const response = await fetch("http://localhost:3000", {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
        "Transfer-Encoding": "chunked",
      },
      body: stream,
      duplex: "half", // Required for streaming requests
    });

    const result = await response.text();
    console.log("Server response:", result);
  } catch (error) {
    console.error("Error sending stream:", error);
  }
}

// Run the client
streamData();
