import { serve } from "../mod.ts";

// Simulate a file stream
async function* generateFileStream() {
  const chunks = ["Hello", " ", "World", " ", "Stream"];
  for (const chunk of chunks) {
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Delay each chunk by 1s
    yield new TextEncoder().encode(chunk);
  }
}

// Create the server
const server = await serve({
  handler({ request }) {
    // Check if the client is requesting the stream endpoint
    if (request.url.endsWith("/stream-with-data")) {
      // Create a TransformStream to handle the streaming data
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();

      // Start processing the stream
      (async () => {
        try {
          // First, send the JSON data with a special marker
          const jsonData = {
            metadata: {
              filename: "example.txt",
              timestamp: new Date().toISOString(),
              type: "text/plain",
            },
          };
          const jsonChunk = new TextEncoder().encode(
            `--metadata\n${JSON.stringify(jsonData)}\n--stream\n`,
          );
          await writer.write(jsonChunk);

          // Then send the file stream
          for await (const chunk of generateFileStream()) {
            await writer.write(chunk);
          }
        } finally {
          await writer.close();
        }
      })();

      // Return the streaming response
      return new Response(readable, {
        headers: {
          "Content-Type": "application/octet-stream",
          "Transfer-Encoding": "chunked",
        },
      });
    }

    // Return a simple HTML page with a download link
    return new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Stream and JSON Example</title>
        </head>
        <body>
          <h1>Stream and JSON Example</h1>
          <button id="downloadBtn">Download Stream with Metadata</button>
          <pre id="output"></pre>

          <script defer>
              console.log("adasdasd");
              const downloadBtn = document.getElementById('downloadBtn');
              const output = document.getElementById('output');

              downloadBtn.addEventListener('click', async function() {
                output.textContent = 'Downloading...\\n';

                try {
                  const response = await fetch('/stream-with-data');
                  const reader = response.body.getReader();
                  const decoder = new TextDecoder();
                  let metadata = null;
                  let isMetadata = true;

                  while (true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    
                    const text = decoder.decode(value);
                    
                    if (isMetadata && text.includes('--metadata')) {
                      const parts = text.split('--metadata\\n')[1].split('--stream\\n');
                      metadata = JSON.parse(parts[0]);
                      output.textContent += 'Metadata received: ' + JSON.stringify(metadata, null, 2) + '\\n\\nStream data:\\n';
                      isMetadata = false;
                      
                      if (parts[1]) {
                        output.textContent += parts[1];
                      }
                    } else {
                      output.textContent += text;
                    }
                  }
                  
                  output.textContent += '\\n\\nDownload complete!';
                } catch (error) {
                  output.textContent += '\\nError: ' + error.message;
                  console.error('Download error:', error);
                }
              });
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
  port: 3000,
});

console.log(
  `Server running at http://${server.addr.hostname}:${server.addr.port}`,
);
