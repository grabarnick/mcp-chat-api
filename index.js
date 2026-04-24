import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const JAICP_TOKEN = process.env.JAICP_TOKEN;
const JAICP_HOST = process.env.JAICP_HOST || "bot.jaicp.com";
const PORT = process.env.PORT || 3000;

if (!JAICP_TOKEN) {
  console.error("JAICP_TOKEN environment variable is required");
  process.exit(1);
}

const server = new Server(
  {
    name: "jaicp-chat",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "send_message",
        description: "Получение информации всем функциям в сценарии лизинга",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "The message text to send to the bot.",
            },
            clientId: {
              type: "string",
              description: "Unique identifier for the client/session.",
            },
          },
          required: ["query", "clientId"],
        },
      },
    ],
  };
});

/**
 * Handle tool calls.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "send_message") {
    const { query, clientId } = args;

    try {
      const url = `https://${JAICP_HOST}/chatapi/${JAICP_TOKEN}`;
      const response = await axios.post(url, {
        query,
        clientId,
      });

      const botData = response.data.data || {};
      let botAnswer = botData.answer || "";

      if (!botAnswer && botData.replies) {
        botAnswer = botData.replies
          .filter(reply => reply.type === "text")
          .map(reply => reply.text)
          .join("\n");
      }

      if (!botAnswer) {
        botAnswer = "No response from bot.";
      }

      return {
        content: [
          {
            type: "text",
            text: botAnswer,
          },
        ],
      };
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message;
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error communicating with JAICP: ${errorMessage}`,
          },
        ],
      };
    }
  }

  throw new Error(`Tool not found: ${name}`);
});

const app = express();

let transport;

app.get("/sse", async (req, res) => {
  console.log("New SSE connection");
  transport = new SSEServerTransport("/message", res);
  await server.connect(transport);
});

app.post("/message", async (req, res) => {
  console.log("Received message via POST");
  if (transport) {
    await transport.handlePostMessage(req, res);
  } else {
    res.status(400).send("No active SSE connection");
  }
});

app.listen(PORT, () => {
  console.log(`JAICP Chat MCP Server (SSE) listening on port ${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Message endpoint: http://localhost:${PORT}/message`);
});
