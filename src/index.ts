#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || "global";
// NOTE: the Developer-API alias "gemini-flash-latest" does not exist as a
// Vertex AI publisher model and fails with 404 on Vertex; keep the default
// pinned to a model available for the configured GCP_LOCATION (see the
// Gemini Agent Platform model documentation).
const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";
// Gemini 3 models report reasoning depth via thinkingLevel while thinkingBudget
// remains supported. GEMINI_THINKING_LEVEL (low|medium|high|minimal) takes
// precedence when set. Note: gemini-3.8-flash rejects "minimal".
const thinkingLevel = parseThinkingLevel(process.env.GEMINI_THINKING_LEVEL);
const thinkingBudget = Number(process.env.GEMINI_THINKING_BUDGET) || 512;

/**
 * Maps an accepted GEMINI_THINKING_LEVEL value onto the SDK enum. Unknown
 * values warn and fall back to the thinkingBudget path so a bad override can
 * never break startup.
 */
function parseThinkingLevel(raw: string | undefined): ThinkingLevel | undefined {
  if (!raw) return undefined;
  const levels: Record<string, ThinkingLevel> = {
    low: ThinkingLevel.LOW,
    medium: ThinkingLevel.MEDIUM,
    high: ThinkingLevel.HIGH,
    minimal: ThinkingLevel.MINIMAL,
  };
  const level = levels[raw.trim().toLowerCase()];
  if (!level) {
    console.error(
      `Warning: ignoring unknown GEMINI_THINKING_LEVEL "${raw}" (expected low, medium, high, or minimal).`
    );
    return undefined;
  }
  return level;
}

if (!projectId) {
  console.error("Error: GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT environment variable must be set.");
  process.exit(1);
}

const client = new GoogleGenAI({
  vertexai: true,
  project: projectId,
  location: location,
});

/**
 * Shared Gemini call. The API only allows a single (search-type) tool per
 * request on the models this server targets, so each call passes exactly
 * one tool.
 */
async function callGemini(query: string, tool: any): Promise<string> {
  try {
    const response = await client.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: query }] }],
      config: {
        thinkingConfig: thinkingLevel ? { thinkingLevel } : { thinkingBudget },
        tools: tool ? [tool] : [],
      },
    });
    return response.text || "No response text found.";
  } catch (error: any) {
    throw new Error(`Gemini API error: ${error.message}`);
  }
}

/** Wraps a Gemini result into a standard MCP tool response. */
function toolResponse(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

const server = new McpServer(
  {
    name: "gemini-agent-mcp",
    version: "3.1.0",
  },
  {
    capabilities: { tools: {} },
  }
);

/**
 * Legacy all-in-one agent tool. Kept for backward compatibility with
 * existing client configurations. gemini-flash-latest and similar models
 * reject combined tool requests ("Multiple tools are supported only when
 * they are all search tools"), so this tool now performs a single
 * search-grounded call.
 */
server.registerTool(
  "ask_gemini_agent",
  {
    description: "An AI agent capable of searching the web (search grounding), analyzing specific URLs, and writing/executing Python code to solve complex problems, perform data analysis, or answer research questions.",
    inputSchema: {
      query: z.string().describe("The task, question, or research topic for the agent to resolve"),
    },
  },
  async ({ query }) => {
    try {
      const text = await callGemini(query, { googleSearch: {} });
      return toolResponse(text);
    } catch (error: any) {
      return toolResponse(`Error performing search: ${error.message}`, true);
    }
  }
);

/** Web search grounded on Google Search. */
server.registerTool(
  "gemini_web_search",
  {
    description: "Search the web using Google Search grounding and get an AI-synthesized answer with up-to-the-minute information. Use for current events, recent releases, news, or any question where search results would improve the answer.",
    inputSchema: {
      query: z.string().describe("The question or search query"),
    },
  },
  async ({ query }) => {
    try {
      const text = await callGemini(query, { googleSearch: {} });
      return toolResponse(text);
    } catch (error: any) {
      return toolResponse(`Error performing search: ${error.message}`, true);
    }
  }
);

/** Deep analysis of specific web page URLs. */
server.registerTool(
  "gemini_url_context",
  {
    description: "Fetches and deeply analyzes the content of specific web page URLs. Use when you have a concrete URL and want to extract, summarize, or answer questions about its content (documentation pages, articles, blog posts, etc.).",
    inputSchema: {
      urls: z.array(z.string().url()).min(1).describe("One or more URLs to fetch and analyze"),
      instruction: z.string().optional().describe("What you want to learn from the page(s), e.g. 'summarize the key points' or 'extract the installation instructions'"),
    },
  },
  async ({ urls, instruction }) => {
    const urlList = urls.map((u) => `- ${u}`).join("\n");
    const prompt = `Please analyze the following web page(s):

${urlList}

Instruction: ${instruction || "Summarize the main content of each page."}`;
    try {
      const text = await callGemini(prompt, { urlContext: {} });
      return toolResponse(text);
    } catch (error: any) {
      return toolResponse(`Error analyzing URL(s): ${error.message}`, true);
    }
  }
);

/** Python code execution in the Gemini sandbox. */
server.registerTool(
  "gemini_code_execution",
  {
    description: "Writes and executes Python code in a Gemini sandbox to solve problems that benefit from computation: math, data analysis, statistics, data transformation, simulations, or logical reasoning. Returns the result along with any code written. Use for calculations and programmatic tasks.",
    inputSchema: {
      task: z.string().describe("The computational task or question, described in plain language"),
    },
  },
  async ({ task }) => {
    try {
      const text = await callGemini(task, { codeExecution: {} });
      return toolResponse(text);
    } catch (error: any) {
      return toolResponse(`Error executing code: ${error.message}`, true);
    }
  }
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Gemini Agent MCP Server (3 tools) running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});