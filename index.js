import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();

const JAICP_TOKEN = process.env.JAICP_TOKEN;
const JAICP_HOST = process.env.JAICP_HOST || "bot.jaicp.com";
const PORT = process.env.PORT || 3000;

if (!JAICP_TOKEN) {
  console.error("JAICP_TOKEN environment variable is required");
  process.exit(1);
}

const ML_CALCULATOR_TOKEN = process.env.ML_CALCULATOR_TOKEN;
const SMS_USER = process.env.SMS_USER;
const SMS_PASSWORD = process.env.SMS_PASSWORD;
const SMS_SENDER = process.env.SMS_SENDER;

// Helper for NBRB rates
async function getRate(currencyCode) {
  try {
    const url = `https://api.nbrb.by/exrates/rates/${currencyCode}?periodicity=0&parammode=2`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(`Error fetching rate for ${currencyCode}:`, error.message);
    return null;
  }
}

// Helper for MLCalculator Auth
async function getMLAuthHeader() {
  const token = process.env.ML_CALCULATOR_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Setup handlers for a server instance
 */
function setupHandlers(server) {
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        /*
        {
          name: "send_message",
          description: "Используй этот инструмент для получения информации из всех функций, инструментов и баз знаний в сценарии лизинга.",
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
        */
        {
          name: "get_exchange_rates",
          description: "Запрашивает курсы валют по отношению к BYN (Нацбанк РБ)",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "check_lizing_object",
          description: "Проверка доступных предметов лизинга по типу клиента",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "check_currencies",
          description: "Запрос в каких валютах доступен расчет графика по типу клиента",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "check_ranges",
          description: "Запрос диапазона стоимости предмета лизинга",
          inputSchema: {
            type: "object",
            properties: {
              subject: { type: "string", description: "Предмет лизинга (напр. 'Легковой автомобиль')" },
              currency: { type: "string", description: "Кодовое обозначение валюты (напр. 'USD')" },
            },
          },
        },
        {
          name: "check_terms",
          description: "Запрос возможных условий лизинга по заданным параметрам",
          inputSchema: {
            type: "object",
            properties: {
              client_type: { type: "string", description: "Физическое лицо или Юридическое лицо" },
              subject: { type: "string" },
              condition_new: { type: "string", description: "1 - новый, 0 - Б/У" },
              age: { type: "string", description: "Возраст в годах" },
              currency: { type: "string" },
              cost: { type: "string" },
              prepaid: { type: "string", description: "Аванс в %" },
              term: { type: "string", description: "Срок в месяцах" },
              type_schedule: { type: "string", description: "0 - Аннуитет, 1 - убывающий" },
            },
          },
        },
        {
          name: "get_payment_schedule",
          description: "Запрашивает график платежей по заданным параметрам",
          inputSchema: {
            type: "object",
            properties: {
              client_type: { type: "string" },
              subject: { type: "string" },
              condition_new: { type: "string" },
              age: { type: "string" },
              currency: { type: "string" },
              cost: { type: "string" },
              prepaid: { type: "string" },
              term: { type: "string" },
              type_schedule: { type: "string" },
              nds_principal: { type: "string", description: "0 или 20" },
            },
            required: ["client_type", "subject", "currency", "cost", "prepaid", "term"],
          },
        },
        {
          name: "currency_conversion",
          description: "Конвертирует из одной валюты в другую по курсу НБ РБ",
          inputSchema: {
            type: "object",
            properties: {
              amount: { type: "number" },
              starting_currency: { type: "string", description: "ISO код (напр. USD)" },
              result_currency: { type: "string", description: "ISO код (напр. BYN)" },
            },
            required: ["amount", "starting_currency", "result_currency"],
          },
        },
        {
          name: "send_consultation_to_amo",
          description: "Отправляет данные консультации в AMO CRM",
          inputSchema: {
            type: "object",
            properties: {
              phoneNumberForSms: { type: "string" },
              statusConsultation: { type: "string" },
              client_type: { type: "string" },
              subject: { type: "string" },
              cost: { type: "string" },
              currency: { type: "string" },
              prepaid: { type: "string" },
              term: { type: "string" },
              calculation_result: { type: "object", description: "Результат функции get_payment_schedule" },
            },
            required: ["phoneNumberForSms", "statusConsultation"],
          },
        },
        {
          name: "send_sms",
          description: "Отправка СМС через сервис SMS-Ассистент",
          inputSchema: {
            type: "object",
            properties: {
              phoneNumberForSms: { type: "string" },
              message: { type: "string" },
            },
            required: ["phoneNumberForSms", "message"],
          },
        },
        {
          name: "get_min_prepaid_value",
          description: "Получить минимальный размер авансового платежа из объекта условий",
          inputSchema: {
            type: "object",
            properties: {
              objectTermsFromCalc: { type: "object", description: "Объект с вариантами условий" },
            },
            required: ["objectTermsFromCalc"],
          },
        },
        {
          name: "add_nds_to_cost",
          description: "Добавляет НДС (20%) к стоимости предмета лизинга",
          inputSchema: {
            type: "object",
            properties: {
              cost: { type: "number" },
            },
            required: ["cost"],
          },
        },
      ],
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    /*
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
    */

    /*
    if (name === "send_message") {
      ...
    }
    */

    try {
      let result;

      switch (name) {
        case "get_exchange_rates": {
          const response = await axios.get("https://api.nbrb.by/exrates/rates/?periodicity=0&parammode=2");
          result = response.data;
          break;
        }

        case "check_lizing_object": {
          const headers = await getMLAuthHeader();
          const response = await axios.get("https://personal.mikro-leasing.by/calculator/api/1.0/subjects/", { headers });
          result = response.data;
          break;
        }

        case "check_currencies": {
          const headers = await getMLAuthHeader();
          const response = await axios.get("https://personal.mikro-leasing.by/calculator/api/1.0/currencies/", { headers });
          result = response.data;
          break;
        }

        case "check_ranges": {
          const { subject, currency } = args;
          const headers = await getMLAuthHeader();
          let url = "https://personal.mikro-leasing.by/calculator/api/1.0/ranges/?";
          if (subject) url += `subject=${encodeURIComponent(subject)}&`;
          if (currency) url += `currency=${encodeURIComponent(currency)}`;
          const response = await axios.get(url, { headers });
          result = response.data;
          break;
        }

        case "check_terms": {
          const headers = await getMLAuthHeader();
          let url = "https://personal.mikro-leasing.by/calculator/api/1.0/terms/?";
          for (const [key, value] of Object.entries(args)) {
            if (value !== undefined && value !== null) url += `&${key}=${encodeURIComponent(value)}`;
          }
          const response = await axios.get(url, { headers });
          result = response.data;
          break;
        }

        case "get_payment_schedule": {
          const headers = await getMLAuthHeader();
          let url = "https://personal.mikro-leasing.by/calculator/api/1.0/calculate/?";
          for (const [key, value] of Object.entries(args)) {
            if (value !== undefined && value !== null) url += `&${key}=${encodeURIComponent(value)}`;
          }
          const response = await axios.get(url, { headers });
          result = response.data;
          break;
        }

        case "currency_conversion": {
          const { amount, starting_currency, result_currency } = args;
          if (result_currency === "BYN") {
            if (starting_currency === "BYN") {
              result = amount;
            } else {
              const rate = await getRate(starting_currency);
              result = rate ? Math.round((amount * rate.Cur_OfficialRate) / rate.Cur_Scale) : "Rate not found";
            }
          } else if (starting_currency === "BYN") {
            const rate = await getRate(result_currency);
            result = rate ? Math.round((amount / rate.Cur_OfficialRate) * rate.Cur_Scale) : "Rate not found";
          } else {
            const rateStart = await getRate(starting_currency);
            const rateResult = await getRate(result_currency);
            if (rateStart && rateResult) {
              const inBYN = (amount * rateStart.Cur_OfficialRate) / rateStart.Cur_Scale;
              result = Math.round((inBYN / rateResult.Cur_OfficialRate) * rateResult.Cur_Scale);
            } else {
              result = "Rates not found";
            }
          }
          break;
        }

        case "send_consultation_to_amo": {
          const url = "https://core.leadconnector.ru/mikroleasing/webhooks/just_ai/zhu2utnbn1hivdnvy0lvbjqrvgzqdz09";
          const response = await axios.post(url, args);
          result = response.data || "Success";
          break;
        }

        case "send_sms": {
          const { phoneNumberForSms, message } = args;
          const url = `https://userarea.sms-assistent.by/api/v1/send_sms/plain?user=${SMS_USER}&password=${SMS_PASSWORD}&recipient=${phoneNumberForSms}&message=${encodeURIComponent(message)}&sender=${SMS_SENDER}`;
          const response = await axios.get(url);
          result = response.data;
          break;
        }

        case "get_min_prepaid_value": {
          const { objectTermsFromCalc } = args;
          const prepaidArray = [];
          for (const item in objectTermsFromCalc) {
            if (objectTermsFromCalc[item].prepaid !== undefined) {
              prepaidArray.push(Number(objectTermsFromCalc[item].prepaid));
            }
          }
          const minValue = prepaidArray.length > 0 ? Math.min(...prepaidArray) : null;
          result = { minPrepaidValue: minValue };
          break;
        }

        case "add_nds_to_cost": {
          const { cost } = args;
          const ndsRate = 20; // Default from userFunctions.json
          const newCost = cost + (cost * ndsRate) / 100;
          result = newCost;
          break;
        }

        default:
          throw new Error(`Tool not found: ${name}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error.response?.data ? JSON.stringify(error.response.data) : error.message }],
      };
    }

    throw new Error(`Tool not found: ${name}`);
  });
}

const app = express();
app.use(cors());

// Request logging (without body parsing)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Map to track active SSE transports
const transports = new Map();

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/sse", async (req, res) => {
  console.log("New SSE connection");

  // Create a fresh server instance for this connection
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

  setupHandlers(server);

  const transport = new SSEServerTransport("/message", res);
  transports.set(transport.sessionId, transport);

  await server.connect(transport);

  res.on("close", () => {
    console.log(`SSE connection closed: ${transport.sessionId}`);
    transports.delete(transport.sessionId);
  });
});

app.post("/message", async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = transports.get(sessionId);

  if (transport) {
    // SSEServerTransport.handlePostMessage will read the raw request body
    await transport.handlePostMessage(req, res);
  } else {
    console.error(`Session not found: ${sessionId}`);
    res.status(400).send("Session not found or expired");
  }
});

app.listen(PORT, () => {
  console.log(`JAICP Chat MCP Server (SSE) listening on port ${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
  console.log(`Message endpoint: http://localhost:${PORT}/message`);
});
