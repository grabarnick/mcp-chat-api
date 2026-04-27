import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

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

// Load user functions from project file
const USER_FUNCTIONS_PATH = path.join(process.cwd(), "project", "Демо-бот-JustAI", "userFunctions.json");
let userFunctionsData = [];
try {
  const content = fs.readFileSync(USER_FUNCTIONS_PATH, "utf8");
  userFunctionsData = JSON.parse(content);
} catch (err) {
  console.error("Error loading userFunctions.json:", err.message);
}

function getUserFunctionCode(name) {
  const fn = userFunctionsData.find(f => f.name === name);
  return fn ? fn.code : null;
}

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
        {
          name: "NBRB.getExchangeRates",
          description: "Запрашивает курсы валют по отношению к BYN (Нацбанк РБ)",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "NBRB.getRateOneCurrency",
          description: "Запрашивает курс конкретной валюты по отношению к BYN",
          inputSchema: {
            type: "object",
            properties: {
              currencyCode: { type: "string" },
            },
            required: ["currencyCode"],
          },
        },
        {
          name: "MLCalculator.checkLizingObject",
          description: "Проверка доступных предметов лизинга по типу клиента",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "MLCalculator.checkCurrencies",
          description: "Запрос в каких валютах доступен расчет графика по типу клиента",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "MLCalculator.checkRanges",
          description: "Запрос диапазона стоимости предмета лизинга",
          inputSchema: {
            type: "object",
            properties: {
              subject: { type: "string" },
              currency: { type: "string" },
            },
          },
        },
        {
          name: "MLCalculator.checkTerms",
          description: "Запрос возможных условий лизинга по заданным параметрам",
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
            },
          },
        },
        {
          name: "MLCalculator.getPaymentSchedule",
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
              nds_principal: { type: "string" },
            },
            required: ["client_type", "subject", "currency", "cost", "prepaid", "term"],
          },
        },
        {
          name: "Conversion.currencyConversionAll",
          description: "Конвертирует из одной валюты в другую по курсу НБ РБ",
          inputSchema: {
            type: "object",
            properties: {
              amount: { type: "number" },
              starting_currency: { type: "string" },
              result_currency: { type: "string" },
            },
            required: ["amount", "starting_currency", "result_currency"],
          },
        },
        {
          name: "SMSAssistent.sendSMS",
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
          name: "othersFunctions.getMinPrepaidFromCalculatorResult",
          description: "Получить минимальный размер авансового платежа из объекта условий",
          inputSchema: {
            type: "object",
            properties: {
              objectTermsFromCalc: { type: "object" },
            },
            required: ["objectTermsFromCalc"],
          },
        },
        {
          name: "othersFunctions.sendResultConsultationInAMO",
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
              calculation_result: { type: "object" },
            },
            required: ["phoneNumberForSms", "statusConsultation"],
          },
        },
        {
          name: "othersFunctions.addNDSForCost",
          description: "Добавляет НДС (20%) к стоимости предмета лизинга",
          inputSchema: {
            type: "object",
            properties: {
              cost: { type: "number" },
            },
            required: ["cost"],
          },
        },
        {
          name: "othersFunctions.getDialogHistory",
          description: "Возвращает историю диалога",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "ForAgentCont.questionsStepsList",
          description: "Список вопросов-шагов",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "ForAgentCont.getPromtQuestionsStepsList",
          description: "Возвращает промт из списка промтов",
          inputSchema: {
            type: "object",
            properties: {
              questionType: { type: "string" },
            },
            required: ["questionType"],
          },
        },
        {
          name: "ForAgentCont.sendNoteInAgent",
          description: "Отправка заметки в контекст",
          inputSchema: {
            type: "object",
            properties: {
              questionType: { type: "string" },
            },
            required: ["questionType"],
          },
        },
        {
          name: "Prompts.promptForFL",
          description: "Инструкция для агента работающего с физическими лицами",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "Prompts.promptForUL",
          description: "Инструкция для агента работающего с юридическими лицами",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "Prompts.promptForRag",
          description: "Промт для базы знаний Rag",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "Dictionaries.doNotFinance",
          description: "Список предметов которые не финансируем",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "Dictionaries.constants",
          description: "Список констант со значениями",
          inputSchema: { type: "object", properties: {} },
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
        case "NBRB.getExchangeRates":
        case "get_exchange_rates": {
          const response = await axios.get("https://api.nbrb.by/exrates/rates/?periodicity=0&parammode=2");
          result = response.data;
          break;
        }

        case "NBRB.getRateOneCurrency": {
          const { currencyCode } = args;
          result = await getRate(currencyCode);
          break;
        }

        case "MLCalculator.checkLizingObject":
        case "check_lizing_object": {
          const headers = await getMLAuthHeader();
          const response = await axios.get("https://personal.mikro-leasing.by/calculator/api/1.0/subjects/", { headers });
          result = response.data;
          break;
        }

        case "MLCalculator.checkCurrencies":
        case "check_currencies": {
          const headers = await getMLAuthHeader();
          const response = await axios.get("https://personal.mikro-leasing.by/calculator/api/1.0/currencies/", { headers });
          result = response.data;
          break;
        }

        case "MLCalculator.checkRanges":
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

        case "MLCalculator.checkTerms":
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

        case "MLCalculator.getPaymentSchedule":
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

        case "Conversion.currencyConversionAll":
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

        case "othersFunctions.sendResultConsultationInAMO":
        case "send_consultation_to_amo": {
          const url = "https://core.leadconnector.ru/mikroleasing/webhooks/just_ai/zhu2utnbn1hivdnvy0lvbjqrvgzqdz09";
          const response = await axios.post(url, args);
          result = response.data || "Success";
          break;
        }

        case "SMSAssistent.sendSMS":
        case "send_sms": {
          const { phoneNumberForSms, message } = args;
          const url = `https://userarea.sms-assistent.by/api/v1/send_sms/plain?user=${SMS_USER}&password=${SMS_PASSWORD}&recipient=${phoneNumberForSms}&message=${encodeURIComponent(message)}&sender=${SMS_SENDER}`;
          const response = await axios.get(url);
          result = response.data;
          break;
        }

        case "othersFunctions.getMinPrepaidFromCalculatorResult":
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

        case "othersFunctions.addNDSForCost":
        case "add_nds_to_cost": {
          const { cost } = args;
          const ndsRate = 20;
          const newCost = cost + (cost * ndsRate) / 100;
          result = newCost;
          break;
        }

        case "othersFunctions.getDialogHistory": {
          result = "History is not available in MCP mode yet.";
          break;
        }

        case "ForAgentCont.sendNoteInAgent": {
          const { questionType } = args;
          result = `Note for ${questionType} has been added to context.`;
          break;
        }

        case "ForAgentCont.questionsStepsList": {
          // This function returns a large object in JAICP. We'll return the parsed object or a mock.
          const code = getUserFunctionCode("questionsStepsList");
          // Extract the object if it's a simple return
          if (code && code.includes("return {")) {
            const jsonPart = code.substring(code.indexOf("{"), code.lastIndexOf("}") + 1);
            try {
              // Note: this is a bit hacky but works for static objects
              result = eval(`(${jsonPart})`);
            } catch (e) {
              result = "Error parsing questionsStepsList code";
            }
          } else {
            result = "questionsStepsList code not found or too complex";
          }
          break;
        }

        case "ForAgentCont.getPromtQuestionsStepsList": {
          const { questionType } = args;
          const code = getUserFunctionCode("questionsStepsList");
          if (code && code.includes("return {")) {
            const jsonPart = code.substring(code.indexOf("{"), code.lastIndexOf("}") + 1);
            try {
              const list = eval(`(${jsonPart})`);
              result = list[questionType] || "Instruction not found";
            } catch (e) {
              result = "Error parsing questionsStepsList code";
            }
          } else {
            result = "questionsStepsList code not found";
          }
          break;
        }

        case "Prompts.promptForFL": {
          const p1 = getUserFunctionCode("promptForFLULCommon_Part_1") || "";
          const p3 = getUserFunctionCode("promptForFLULCommon_Part_3") || "";
          // Extract part 2 from promptForFL code
          const fullCode = getUserFunctionCode("promptForFL") || "";
          const part2Match = fullCode.match(/let part_2 = `([\s\S]*?)`;/);
          const p2 = part2Match ? part2Match[1] : "";
          result = p1 + p2 + p3;
          break;
        }

        case "Prompts.promptForUL": {
          const p1 = getUserFunctionCode("promptForFLULCommon_Part_1") || "";
          const p3 = getUserFunctionCode("promptForFLULCommon_Part_3") || "";
          const fullCode = getUserFunctionCode("promptForUL") || "";
          const part2Match = fullCode.match(/let part_2 = `([\s\S]*?)`;/);
          const p2 = part2Match ? part2Match[1] : "";
          result = p1 + p2 + p3;
          break;
        }

        case "Prompts.promptForRag": {
          const code = getUserFunctionCode("promptForRag") || "";
          const match = code.match(/return `([\s\S]*?)`;/);
          result = match ? match[1] : "Rag prompt not found";
          break;
        }

        case "Dictionaries.doNotFinance": {
          const code = getUserFunctionCode("doNotFinance") || "";
          const match = code.match(/return `([\s\S]*?)`;/);
          result = match ? match[1] : "doNotFinance list not found";
          break;
        }

        case "Dictionaries.constants": {
          const code = getUserFunctionCode("constants") || "";
          if (code && code.includes("return {")) {
            const jsonPart = code.substring(code.indexOf("{"), code.lastIndexOf("}") + 1);
            try {
              result = eval(`(${jsonPart})`);
            } catch (e) {
              result = "Error parsing constants code";
            }
          } else {
            result = "Constants not found";
          }
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
