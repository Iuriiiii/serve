import { serve } from "../mod.ts";

// Type definitions
interface Todo {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

// In-memory storage
const todos = new Map<string, Todo>();

// Helper to parse JSON body
// deno-lint-ignore no-explicit-any
async function parseBody(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch (_) {
    throw new Error("Invalid JSON body");
  }
}

// Helper to generate responses
// deno-lint-ignore no-explicit-any
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// Main server setup
const server = await serve({
  port: 3000,
  async handler({ request }) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const id = path.split("/")[2]; // Get ID from /todos/{id}

    try {
      // CREATE - POST /todos
      if (request.method === "POST" && path === "/todos") {
        const body = await parseBody(request);
        const todo: Todo = {
          id: crypto.randomUUID(),
          title: body.title,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        todos.set(todo.id, todo);
        return jsonResponse(todo, 201);
      }

      // READ (List) - GET /todos
      if (request.method === "GET" && path === "/todos") {
        return jsonResponse(Array.from(todos.values()));
      }

      // READ (Single) - GET /todos/{id}
      if (request.method === "GET" && id) {
        const todo = todos.get(id);
        if (!todo) return jsonResponse({ error: "Todo not found" }, 404);
        return jsonResponse(todo);
      }

      // UPDATE - PUT /todos/{id}
      if (request.method === "PUT" && id) {
        const todo = todos.get(id);
        if (!todo) return jsonResponse({ error: "Todo not found" }, 404);

        const body = await parseBody(request);
        const updatedTodo: Todo = {
          ...todo,
          title: body.title ?? todo.title,
          completed: body.completed ?? todo.completed,
        };
        todos.set(id, updatedTodo);
        return jsonResponse(updatedTodo);
      }

      // DELETE - DELETE /todos/{id}
      if (request.method === "DELETE" && id) {
        const deleted = todos.delete(id);
        if (!deleted) return jsonResponse({ error: "Todo not found" }, 404);
        return jsonResponse({ message: "Todo deleted successfully" });
      }

      // Not found for any other routes
      return jsonResponse({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Error handling request:", error);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  },
});

console.log(
  `Server running at http://${server.addr.hostname}:${server.addr.port}`,
);

import process from "node:process";

// Cleanup on shutdown
const cleanup = async () => {
  console.log("\nShutting down server...");
  await server.close();
  process.exit(0);
};

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

/*
  Frontend API Client Examples using fetch
  ======================================
  Copy this section to your frontend code to interact with the API.
*/

const API_URL = "http://localhost:3000";

// Create a new todo
async function createTodo(title: string) {
  const response = await fetch(`${API_URL}/todos`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title }),
  });

  if (!response.ok) throw new Error("Failed to create todo");
  return response.json();
}

// Get all todos
async function getAllTodos() {
  const response = await fetch(`${API_URL}/todos`);

  if (!response.ok) throw new Error("Failed to fetch todos");
  return response.json();
}

// Get a single todo by ID
async function getTodoById(id: string) {
  const response = await fetch(`${API_URL}/todos/${id}`);

  if (!response.ok) throw new Error("Failed to fetch todo");
  return response.json();
}

// Update a todo
async function updateTodo(
  id: string,
  updates: { title?: string; completed?: boolean },
) {
  const response = await fetch(`${API_URL}/todos/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) throw new Error("Failed to update todo");
  return response.json();
}

// Delete a todo
async function deleteTodo(id: string) {
  const response = await fetch(`${API_URL}/todos/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) throw new Error("Failed to delete todo");
  return response.json();
}

// Usage examples
async function example() {
  try {
    // Create a new todo
    const newTodo = await createTodo("Learn TypeScript");
    console.log("Created todo:", newTodo);

    // Get all todos
    const allTodos = await getAllTodos();
    console.log("All todos:", allTodos);

    // Get the todo we just created
    const todo = await getTodoById(newTodo.id);
    console.log("Single todo:", todo);

    // Update the todo
    const updatedTodo = await updateTodo(newTodo.id, {
      completed: true,
      title: "Learn TypeScript and Node.js",
    });
    console.log("Updated todo:", updatedTodo);

    // Delete the todo
    const deleteResult = await deleteTodo(newTodo.id);
    console.log("Delete result:", deleteResult);
  } catch (error) {
    console.error("Error in example:", error);
  }
}

example();
