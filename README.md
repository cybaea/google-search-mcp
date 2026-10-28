# Gemini Agent MCP Server

An advanced Model Context Protocol (MCP) server that provides three purpose-built agent tools — web search, URL analysis, and code execution — via **Gemini Flash** models on Vertex AI.

Unlike a standard search tool, this server separates each capability into its own MCP tool, so your AI client (goose, Claude Desktop, etc.) can orchestrate real-time Google Search, deep URL analysis, and Python code execution across multiple requests to solve complex, multi-step research and data tasks.

## Features

-   **Search Grounding**: Uses Google Search to find up-to-the-minute information.
-   **URL Context**: Automatically fetches and parses the content of specific web pages for deep analysis.
-   **Code Execution**: Writes and executes Python code on-the-fly to perform calculations, data manipulation, or logical reasoning.
-   **Thinking Mode**: Uses Gemini's internal reasoning to plan and refine its approach before answering — a 512-token thinking budget by default, overridable with `GEMINI_THINKING_LEVEL` or `GEMINI_THINKING_BUDGET`.

## Prerequisites

1.  **Google Cloud Project**: You must have a Google Cloud project with the Vertex AI API enabled.
2.  **Authentication**: You must have [gcloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated:
    ```bash
    gcloud auth application-default login
    ```
3.  **Permissions**: Your account needs the `Vertex AI User` role on the project.

## Configuration

The server requires the following environment variables:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `GCP_PROJECT_ID` | Your Google Cloud Project ID (Required) | - |
| `GCP_LOCATION` | Vertex AI location | `global` |
| `GEMINI_MODEL` | Gemini model ID to call; must be available for the project and location on Vertex AI | `gemini-3.8-flash` |
| `GEMINI_THINKING_LEVEL` | Overrides thinking depth (`low`, `medium`, `high`, or `minimal`); takes precedence over the budget. Note: support varies by model — `gemini-3.8-flash` rejects `minimal` | unset |
| `GEMINI_THINKING_BUDGET` | Thinking budget in tokens | `512` |

*Note: `GOOGLE_CLOUD_PROJECT` can also be used instead of `GCP_PROJECT_ID`, and `GOOGLE_CLOUD_LOCATION` instead of `GCP_LOCATION`.*

## Installation & Usage

### 1. Build the project
```bash
npm install
npm run build
```

### 2. Integration with Goose
Add the following to your `~/.config/goose/profiles.yaml` (or manage via the Goose UI):

```yaml
  gemini-agent:
    cmd: node
    args:
      - /path/to/gemini-agent-mcp/build/index.js
    envs:
      GCP_PROJECT_ID: "your-project-id"
      GCP_LOCATION: "global"
```

### 3. Integration with Claude Desktop
Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "gemini-agent": {
      "command": "node",
      "args": ["/path/to/gemini-agent-mcp/build/index.js"],
      "env": {
        "GCP_PROJECT_ID": "your-project-id",
        "GCP_LOCATION": "global",
        "PATH": "/usr/local/bin:/usr/bin:/bin" 
      }
    }
  }
}
```

## Tools

The server exposes three purpose-built tools. Because the underlying model rejects requests that combine multiple tools ("Multiple tools are supported only when they are all search tools"), each tool makes a single-tool Gemini call; orchestration across capabilities happens at the client level.

### `gemini_web_search`
Search the web using Google Search grounding and get an AI-synthesized answer with up-to-the-minute information.
- **Arguments**: `query` (string, required)
- **Use for**: current events, recent releases, news, or any question where search results would improve the answer.

### `gemini_url_context`
Fetches and deeply analyzes the content of specific web page URLs.
- **Arguments**: `urls` (array of URLs, required), `instruction` (string, optional — what to learn from the page(s))
- **Use for**: when you have a concrete URL and want to extract, summarize, or answer questions about its content.

### `gemini_code_execution`
Writes and executes Python code in a Gemini sandbox to solve computational problems.
- **Arguments**: `task` (string, required — described in plain language)
- **Use for**: math, data analysis, statistics, data transformation, simulations, or logical reasoning.

### `ask_gemini_agent` (legacy)
The original all-in-one tool, kept for backward compatibility with existing client configurations. Because the configured model cannot combine tools in one request, it now performs a single search-grounded call — prefer the three purpose-built tools above.

## Limitations
- **Model**: Defaults to `gemini-3.8-flash` (current Gemini Flash model on Vertex AI, `global` location). Override with `GEMINI_MODEL` to any model available for your project and `GCP_LOCATION`. Note: Developer-API aliases such as `gemini-flash-latest` do not exist as Vertex AI publisher models and fail with 404 — see the [model documentation](https://cloud.google.com/gemini-enterprise-agent-platform/models).
- **One Tool Per Request**: The model supports search, URL context, and code execution individually, but the API rejects combining them in a single request; the server automatically falls back to a single tool (search first) if the combined request is rejected.
- **Python-only Code Execution**: The code execution environment is restricted to standard Python libraries provided by the Gemini sandbox.
- **Stdio Transport**: This server currently only supports standard I/O communication.

## Testing

`npm run test:integration` runs an end-to-end smoke test over stdio: it launches the built server with `GEMINI_MODEL` unset (exercising the built-in default model), verifies all four tools are registered, and issues one live search-grounded request. It requires Google Application Default Credentials ("gcloud auth application-default login") and network access.

```bash
npm run build
npm run test:integration
```

## License
MIT
