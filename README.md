# Gemini Agent MCP Server

An advanced Model Context Protocol (MCP) server that provides a high-level agentic interface to Google's **Gemini 3.1** models via Vertex AI. 

Unlike a standard search tool, this server exposes a single "Agent" tool that combines real-time Google Search, deep URL analysis, and Python code execution to solve complex, multi-step research and data tasks.

## Features

-   **Search Grounding**: Uses Google Search to find up-to-the-minute information.
-   **URL Context**: Automatically fetches and parses the content of specific web pages for deep analysis.
-   **Code Execution**: Writes and executes Python code on-the-fly to perform calculations, data manipulation, or logical reasoning.
-   **Thinking Mode**: Utilizes Gemini's internal reasoning capabilities (`ThinkingLevel.MEDIUM`) to plan and refine its approach before answering.

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

*Note: `GOOGLE_CLOUD_PROJECT` can also be used instead of `GCP_PROJECT_ID`.*

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

### `ask_gemini_agent`
A single powerful entry point for complex queries.
- **Arguments**: `query` (string)
- **Description**: Handles research, data analysis, and technical questions by orchestrating search, web page reading, and code execution.

## Limitations
- **Gemini 3.1 Preview**: Uses the `gemini-3-flash-preview` model; availability may vary by region.
- **Python-only Code Execution**: The code execution environment is restricted to standard Python libraries provided by the Gemini sandbox.
- **Stdio Transport**: This server currently only supports standard I/O communication.

## License
MIT
