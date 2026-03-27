#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { z } from "zod";

const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
const location = process.env.GCP_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'global';

if (!projectId) {
  console.error("Error: GCP_PROJECT_ID or GOOGLE_CLOUD_PROJECT environment variable must be set.");
  process.exit(1);
}

const client = new GoogleGenAI({
  vertexai: true,
  project: projectId,
  location: location
});

const server = new McpServer(
  {
    name: "gemini-agent-mcp",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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
      // User specified gemini-3-flash-preview
      const response = await client.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [{ role: 'user', parts: [{ text: query }] }],
        config: {
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.MEDIUM,
          },
          tools: [{ googleSearch: {} }, { urlContext: {} }, { codeExecution: {} }],
        }
      });

      // text is a getter according to TS
      const text = response.text || "No response text found.";

      return {
        content: [
          {
            type: "text",
            text: text,
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error performing search: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

async function run() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Search MCP Server running on stdio");
}

run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
