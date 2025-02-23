import { getRuntime, Runtime } from "@online/runtime";
import nodeHttp, { IncomingMessage } from "node:http";
import nodeHttps from "node:https";
import { WebSocketServer } from "ws";
import { Readable } from "node:stream";
import { Buffer } from "node:buffer";
import "@types/bun/index.d.ts";

export type RuntimeWebSocketReadyState = 0 | 1 | 2 | 3;

export interface IRuntimeWebSocket {
  /**
   * Transmits data using the WebSocket connection. data can be a string, a Blob, an ArrayBuffer, or an ArrayBufferView.
   */
  send(data: RuntimeBuffer): void;
  /**
   * Closes the connection.
   *
   * Here is a list of close codes:
   * - `1000` means "normal closure" **(default)**
   * - `1009` means a message was too big and was rejected
   * - `1011` means the server encountered an error
   * - `1012` means the server is restarting
   * - `1013` means the server is too busy or the client is rate-limited
   * - `4000` through `4999` are reserved for applications (you can use it!)
   *
   * To close the connection abruptly, use `terminate()`.
   *
   * @param code The close code to send
   * @param reason The close reason to send
   */
  close(code?: number, reason?: string): void;

  /**
   * Returns the number of bytes of application data (UTF-8 text and binary data) that have been queued using send() but not yet been transmitted to the network.
   *
   * If the WebSocket connection is closed, this attribute's value will only increase with each call to the send() method. (The number does not reset to zero once the connection closes.)
   */
  getBufferedAmount(): number;

  binaryType():
    | "nodebuffer"
    | "arraybuffer"
    | "uint8array"
    | "arraybuffer"
    | "blob"
    | undefined;

  /**
   * The ready state of the client.
   *
   * - if `0`, the client is connecting.
   * - if `1`, the client is connected.
   * - if `2`, the client is closing.
   * - if `3`, the client is closed.
   *
   * @example
   * console.log(socket.readyState); // 1
   */
  readyState(): RuntimeWebSocketReadyState;
}

export type PromiseOrType<T> = Promise<T> | T;

export interface ITls {
  key: string;
  cert: string;
}

export interface IHandlerOptions {
  request: Request;
  // deno-lint-ignore no-explicit-any
  upgradeToWebSocket(data: any): boolean;
}

export enum WebsocketEventType {
  Message = "message",
  Open = "open",
  Close = "close",
  Error = "error",
}

export interface IWebSocketHandlerOptions {
  websocket: IRuntimeWebSocket;
  event: WebsocketEventType;
  // deno-lint-ignore no-explicit-any
  data?: any;
  // deno-lint-ignore no-explicit-any
  error?: any;

  /**
   * The context object passed to the WebSocket handler.
   */
  context?: unknown;
}

export interface IServeOptions {
  handler(options: IHandlerOptions): PromiseOrType<Response>;
  port?: number;
  hostname?: string;
  signal?: AbortSignal;
  tls?: ITls;
  /** Sets `SO_REUSEPORT` on POSIX systems. */
  reusePort?: boolean;
  wsHandler?(options: IWebSocketHandlerOptions): void;
}

export interface NetAddr {
  transport: "tcp" | "udp";
  hostname: string;
  port: number;
}

export interface UnixAddr {
  transport: "unix" | "unixpacket";
  path: string;
}

export type Addr = NetAddr /*| UnixAddr*/;

export interface IServer extends AsyncDisposable, Disposable {
  /**
   * Stop listening to prevent new connections from being accepted.
   *
   * By default, it does not cancel in-flight requests or websockets. That means it may take some time before all network activity stops.
   */
  close(): Promise<void>;
  /**
   * Make the server block the event loop from finishing.
   *
   * Note: the server blocks the event loop from finishing by default.
   * This method is only meaningful after `.unref()` is called.
   */
  ref(): void;
  /**
   * Don't keep the process alive if this server is the only thing left.
   * Active connections may continue to keep the process alive.
   *
   * By default, the server is ref'd.
   */
  unref(): void;
  /** Return the address of the instance. */
  addr: Addr;
}

export type RuntimeServe = (options: IServeOptions) => Promise<IServer>;
export type RuntimeBuffer = string | ArrayBufferLike | Blob | ArrayBufferView;

// deno-lint-ignore no-explicit-any
function bunWebsocketToRuntimeSocket(bunWebsocket: any): IRuntimeWebSocket {
  const runtimeWebsocket: IRuntimeWebSocket = {
    send: (data) => bunWebsocket.send(data),
    close: (code?: number, reason?: string) => bunWebsocket.close(code, reason),
    getBufferedAmount: () => bunWebsocket.getBufferedAmount(),
    readyState: () => bunWebsocket.readyState,
    binaryType: () => bunWebsocket.binaryType,
  };

  return runtimeWebsocket;
}

/**
 * Serve using the Bun runtime.
 */
// deno-lint-ignore require-await
export const bunServe: RuntimeServe = async (options) => {
  const params: Parameters<typeof Bun.serve>[0] = {
    hostname: options.hostname,
    port: options.port,
    reusePort: options.reusePort,
    cert: options.tls?.cert,
    key: options.tls?.key,
    fetch: (request, server) =>
      options.handler({
        request,
        upgradeToWebSocket: (data) => {
          server.upgrade(request, { data });
          return true;
        },
      }),
    websocket: options.wsHandler
      ? {
        message: (ws, message) =>
          options.wsHandler!({
            websocket: bunWebsocketToRuntimeSocket(ws),
            event: WebsocketEventType.Message,
            data: message,
            context: ws.data,
          }),
        open: (ws) =>
          options.wsHandler!({
            websocket: bunWebsocketToRuntimeSocket(ws),
            event: WebsocketEventType.Open,
            context: ws.data,
          }),
        close: (ws) =>
          options.wsHandler!({
            websocket: bunWebsocketToRuntimeSocket(ws),
            event: WebsocketEventType.Close,
            context: ws.data,
          }),
      }
      : undefined,
  };

  const server = Bun.serve(params);
  const stopServer = () => server.stop(true);
  options.signal?.addEventListener("abort", stopServer);

  return {
    close: stopServer,
    addr: {
      hostname: server.hostname,
      port: server.port,
      transport: "tcp",
    },
    ref: server.ref,
    unref: server.unref,
    [Symbol.asyncDispose]: stopServer,
    [Symbol.dispose]: stopServer,
  } satisfies IServer;
};

function denoWebsocketToRuntimeSocket(
  denoWebsocket: WebSocket,
): IRuntimeWebSocket {
  const runtimeWebsocket: IRuntimeWebSocket = {
    send: (...args) => denoWebsocket.send(...args),
    close: (...args) => denoWebsocket.close(...args),
    getBufferedAmount: () => denoWebsocket.bufferedAmount,
    readyState: () => denoWebsocket.readyState as RuntimeWebSocketReadyState,
    binaryType: () => denoWebsocket.binaryType,
  };

  return runtimeWebsocket;
}

/**
 * Serve using the Deno runtime.
 */
export const denoServe: RuntimeServe = async (options) => {
  const params: Parameters<typeof Deno.serve>[0] = {
    hostname: options.hostname,
    port: options.port,
    signal: options.signal,
    cert: options.tls?.cert,
    key: options.tls?.key,
    handler: async (request) => {
      const response = await options.handler({
        request,
        upgradeToWebSocket: (data) => {
          const { socket: denoSocket, response: stupidDenoResponseMember } = Deno.upgradeWebSocket(request);
          const socket = denoWebsocketToRuntimeSocket(denoSocket);

          Object.defineProperty(request, "stupidDenoResponseMember", {
            value: stupidDenoResponseMember,
            enumerable: false
          });

          denoSocket.addEventListener("open", () =>
            options.wsHandler!({
              websocket: socket,
              event: WebsocketEventType.Open,
              context: data,
            })
          );

          denoSocket.addEventListener("message", (event) =>
            options.wsHandler!({
              websocket: socket,
              event: WebsocketEventType.Message,
              data: event.data,
              context: data,
            })
          );

          denoSocket.addEventListener("close", () =>
            options.wsHandler!({
              websocket: socket,
              event: WebsocketEventType.Close,
              context: data,
            })
          );

          return true;
        },
      });

      // @ts-ignore: access to "stupidDenoResponseMember"
      return request.stupidDenoResponseMember ?? response;
    },
    reusePort: options.reusePort,
  };

  const server = Deno.serve(params);

  return {
    close: () => server.shutdown(),
    addr: server.addr,
    ref: server.ref,
    unref: server.unref,
    [Symbol.asyncDispose]: function () {
      return this.close();
    },
    [Symbol.dispose]: function () {
      return this.close();
    },
  } satisfies IServer;
};

function incomingMessageToRequest(
  req: IncomingMessage,
  options: IServeOptions,
): Promise<Request> {
  return new Promise((resolve, reject) => {
    const { method } = req;
    const url = new URL(
      `${options.tls ? "https" : "http"}://${req.headers.host}${req.url}`,
    );
    const headers = req.headers as unknown as Record<string, string>;

    if (method !== "GET" && method !== "HEAD") {
      const chunks: BlobPart[] = [];

      req.on("data", (chunk: BlobPart) => chunks.push(chunk));
      req.on("end", () => {
        const body = new Blob(chunks, {
          type: headers["content-type"] || "application/octet-stream",
        });
        resolve(new Request(url!, { method, headers, body }));
      });
      req.on("error", reject);
    } else {
      resolve(new Request(url!, { method, headers }));
    }
  });
}

export const nodeServe: RuntimeServe = (options) => {
  let wss: WebSocketServer | undefined;
  // Create the appropriate server based on TLS options
  const server = options.tls
    ? nodeHttps.createServer({ key: options.tls.key, cert: options.tls.cert })
    : nodeHttp.createServer();

  if (options.wsHandler) {
    wss = new WebSocketServer({ server });

    // @ts-ignore: ignore any
    wss.on("connection", (ws, request) => {
      const runtimeWs: IRuntimeWebSocket = {
        send: (...args) => ws.send(...args),
        close: (...args) => ws.close(...args),
        getBufferedAmount: () => ws.bufferedAmount,
        readyState: ws.readyState as IRuntimeWebSocket["readyState"],
        binaryType: ws.binaryType as IRuntimeWebSocket["binaryType"],
      };

      // Get the context from the request's upgrade data
      // deno-lint-ignore no-explicit-any
      const context = (request as any).upgradeData;

      // Handle WebSocket events
      options.wsHandler!({
        websocket: runtimeWs,
        event: WebsocketEventType.Open,
        context,
      });

      // deno-lint-ignore no-explicit-any
      ws.on("message", (data: any) => {
        options.wsHandler!({
          websocket: runtimeWs,
          event: WebsocketEventType.Message,
          data,
          context,
        });
      });

      ws.on("close", () => {
        options.wsHandler!({
          websocket: runtimeWs,
          event: WebsocketEventType.Close,
          context,
        });
      });

      // @ts-ignore: ignore any
      ws.on("error", (error) => {
        options.wsHandler!({
          websocket: runtimeWs,
          event: WebsocketEventType.Error,
          error,
          context,
        });
      });
    });
  }

  // Handle HTTP requests
  server.on("request", async (req, res) => {
    try {
      // Convert IncomingMessage to Request
      const request = await incomingMessageToRequest(req, options);

      // Handle potential WebSocket upgrades
      // deno-lint-ignore no-explicit-any
      const upgradeToWebSocket = (data: any) => {
        if (!wss) {
          throw new Error("WebSocket server not initialized");
        }
        // Store the upgrade data for use when the actual upgrade happens
        // deno-lint-ignore no-explicit-any
        (req as any).upgradeData = data;
        // Don't send a response - the upgrade will happen through the 'upgrade' event
        // throw new Error('WebSocket upgrade in progress');
        return true;
      };

      // Get response from handler
      const response = await options.handler({ request, upgradeToWebSocket });

      // Write response headers
      res.writeHead(
        response.status,
        response.statusText,
        Object.fromEntries(response.headers),
      );

      // Stream the response body
      if (response.body) {
        const reader = response.body.getReader();
        const stream = new Readable({
          async read() {
            try {
              const { done, value } = await reader.read();
              if (done) {
                this.push(null);
              } else {
                this.push(Buffer.from(value));
              }
            } catch (error) {
              this.destroy(error as Error);
            }
          },
        });

        stream.pipe(res);
      } else {
        res.end();
      }
    } catch (error) {
      console.error("Error handling request:", error);
      res.writeHead(500).end("Internal Server Error");
    }
  });

  // Start listening
  const listenPromise = new Promise<IServer>((resolve) => {
    server.listen(options.port || 0, options.hostname, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        throw new Error("Invalid address");
      }

      const serverInterface: IServer = {
        close: () =>
          new Promise((resolve) => {
            wss?.close();
            server.close(() => resolve());
          }),
        addr: {
          transport: "tcp",
          hostname: addr.address,
          port: addr.port,
        },
        ref: server.ref,
        unref: server.unref,
        [Symbol.asyncDispose]: async function () {
          await this.close();
        },
        [Symbol.dispose]: function () {
          this.close();
        },
      };

      resolve(serverInterface);
    });
  });

  // Handle abort signal
  if (options.signal) {
    options.signal.addEventListener("abort", () => {
      wss?.close();
      server.close();
    });
  }

  return listenPromise;
};

/**
 * Serve using the current runtime.
 */
export const serve: RuntimeServe = (options) => {
  const runtime = getRuntime();

  switch (runtime) {
    case Runtime.Node:
      return nodeServe(options);
    case Runtime.Deno:
      return denoServe(options);
    case Runtime.Bun:
      return bunServe(options);
    case Runtime.Unknown:
      throw new Error("Could not determine runtime.");
    case Runtime.Browser:
      throw new Error("There is not serve for the browser.");
  }
};
