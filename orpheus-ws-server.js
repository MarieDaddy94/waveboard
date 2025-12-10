const WebSocket = require("ws");

const PORT = 8788;
const wss = new WebSocket.Server({ port: PORT, path: "/orpheus" });

wss.on("connection", socket => {
  console.log("[Orpheus WS] client connected");

  socket.on("message", data => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (e) { return; }

    switch (msg.type) {
      case "state_update":
        const { tempo, masterGain } = msg.payload;
        // Broadcast to others if needed, or log
        // console.log("State updated:", { tempo, masterGain });
        break;

      case "transport":
        console.log("[Transport]", msg.action);
        break;

      case "pattern":
        // Handle incoming pattern save
        break;
    }
  });
});

console.log(`Orpheus WebSocket server listening on ws://localhost:${PORT}/orpheus`);
