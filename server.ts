import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as IOServer } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3000);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling", req.url, err);
      res.statusCode = 500;
      res.end("internal server error");
    }
  });

  const io = new IOServer(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    console.log("socket connected", socket.id);
    // В v2 здесь подпишемся на TelegramClient events и будем эмитить:
    // socket.on("join", (userId) => socket.join(userId));
    socket.on("disconnect", () => console.log("socket disconnect", socket.id));
  });

  // Делаем io доступным глобально для API routes если нужно
  (global as any).io = io;

  httpServer.once("error", (err) => {
    console.error(err);
    process.exit(1);
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Ready on http://${hostname}:${port} (${dev ? "dev" : "prod"})`);
    console.log(`> Socket.io ready`);
  });
});
