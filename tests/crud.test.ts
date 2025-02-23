import { assertEquals, assertObjectMatch, test } from "@inspatial/test";
import { serve } from "../mod.ts";

// In-memory storage for our examples
const users = new Map<string, { id: string; name: string; email: string }>();

// Helper function to generate XML
// deno-lint-ignore no-explicit-any
const generateXML = (obj: Record<string, any>) => {
  const entries = Object.entries(obj).map(([key, value]) =>
    `    <${key}>${value}</${key}>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${
    entries.join("\n")
  }\n</root>`;
};

// CREATE examples with different response formats
test("Create user - JSON response", async () => {
  const port = 8090;
  const newUser = {
    id: "1",
    name: "John Doe",
    email: "john@example.com",
  };

  using _ = await serve({
    port,
    handler: async ({ request }) => {
      if (request.method === "POST") {
        const user = await request.json();
        users.set(user.id, user);
        return new Response(JSON.stringify(user), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Method not allowed", { status: 405 });
    },
  });

  const response = await fetch(`http://localhost:${port}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newUser),
  });

  const responseBody = await response.json();
  assertEquals(response.status, 201);
  assertObjectMatch(responseBody, newUser);
});

test("Create user - XML response", async () => {
  const port = 8091;
  const newUser = {
    id: "2",
    name: "Jane Smith",
    email: "jane@example.com",
  };

  using _ = await serve({
    port,
    handler: async ({ request }) => {
      if (request.method === "POST") {
        const user = await request.json();
        users.set(user.id, user);
        const xmlResponse = generateXML(user);
        return new Response(xmlResponse, {
          status: 201,
          headers: { "Content-Type": "application/xml" },
        });
      }
      return new Response("Method not allowed", { status: 405 });
    },
  });

  const response = await fetch(`http://localhost:${port}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(newUser),
  });

  const responseText = await response.text();
  assertEquals(response.status, 201);
  assertEquals(response.headers.get("Content-Type"), "application/xml");
  assertEquals(responseText.includes("<name>Jane Smith</name>"), true);
});

// READ examples with different response formats
test("Read user - Plain text response", async () => {
  const port = 8092;
  const userId = "1";

  using _ = await serve({
    port,
    handler: ({ request }) => {
      const url = new URL(request.url);
      const id = url.searchParams.get("id");
      const user = users.get(id!);

      if (user) {
        return new Response(`User ${user.name} (${user.email})`, {
          headers: { "Content-Type": "text/plain" },
        });
      }
      return new Response("User not found", { status: 404 });
    },
  });

  const response = await fetch(`http://localhost:${port}?id=${userId}`);
  const text = await response.text();
  assertEquals(response.status, 200);
  assertEquals(text.includes("John Doe"), true);
});

test("Read user - Uint8Array response", async () => {
  const port = 8093;
  const userId = "2";

  using _ = await serve({
    port,
    handler: ({ request }) => {
      const url = new URL(request.url);
      const id = url.searchParams.get("id");
      const user = users.get(id!);

      if (user) {
        const data = new TextEncoder().encode(JSON.stringify(user));
        return new Response(data, {
          headers: { "Content-Type": "application/octet-stream" },
        });
      }
      return new Response("User not found", { status: 404 });
    },
  });

  const response = await fetch(`http://localhost:${port}?id=${userId}`);
  const buffer = await response.arrayBuffer();
  const decoded = JSON.parse(new TextDecoder().decode(buffer));
  assertEquals(response.status, 200);
  assertObjectMatch(decoded, { name: "Jane Smith" });
});

// UPDATE example
test("Update user - JSON response", async () => {
  const port = 8094;
  const userId = "1";
  const updatedData = {
    name: "John Updated",
    email: "john.updated@example.com",
  };

  using _ = await serve({
    port,
    handler: async ({ request }) => {
      if (request.method === "PUT") {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        const user = users.get(id!);

        if (user) {
          const update = await request.json();
          const updatedUser = { ...user, ...update };
          users.set(id!, updatedUser);
          return new Response(JSON.stringify(updatedUser), {
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response("User not found", { status: 404 });
      }
      return new Response("Method not allowed", { status: 405 });
    },
  });

  const response = await fetch(`http://localhost:${port}?id=${userId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updatedData),
  });

  const responseBody = await response.json();
  assertEquals(response.status, 200);
  assertObjectMatch(responseBody, { name: "John Updated" });
});

// DELETE example
test("Delete user - XML response", async () => {
  const port = 8095;
  const userId = "2";

  using _ = await serve({
    port,
    handler: ({ request }) => {
      if (request.method === "DELETE") {
        const url = new URL(request.url);
        const id = url.searchParams.get("id");
        const user = users.get(id!);

        if (user) {
          users.delete(id!);
          const xmlResponse = generateXML({
            status: "success",
            message: `User ${user.name} deleted successfully`,
          });
          return new Response(xmlResponse, {
            headers: { "Content-Type": "application/xml" },
          });
        }
        return new Response("User not found", { status: 404 });
      }
      return new Response("Method not allowed", { status: 405 });
    },
  });

  const response = await fetch(`http://localhost:${port}?id=${userId}`, {
    method: "DELETE",
  });

  const responseText = await response.text();
  assertEquals(response.status, 200);
  assertEquals(response.headers.get("Content-Type"), "application/xml");
  assertEquals(responseText.includes("<status>success</status>"), true);
});
