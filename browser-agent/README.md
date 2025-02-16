# Browser Automation with Stagehand and LangChain

This project demonstrates browser automation using Stagehand and LangChain, allowing you to control a browser through an AI agent and stream the actions to a public URL.

## Prerequisites

- Node.js (v16 or later)
- npm
- OpenAI API key

## Setup

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Set up your OpenAI API key:
   ```bash
   export OPENAI_API_KEY=your_api_key_here
   ```

3. Build the TypeScript project:
   ```bash
   npm run build
   ```

## Running the Demo

To run the browser automation demo:

```bash
npm run dev
```

This will:
1. Start a browser session
2. Navigate to Google
3. Search for "OpenAI"
4. Print a public URL where you can watch the automation in real-time

## Project Structure

- `src/index.ts`: Main entry point containing the browser automation logic
- `dist/`: Compiled JavaScript files
- `package.json`: Project configuration and dependencies
- `tsconfig.json`: TypeScript configuration

## Configuration

The project uses the following configuration:
- Stagehand is configured to run in LOCAL environment with caching enabled
- GPT-4 is used as the language model with temperature set to 0
- The agent uses both navigation and action tools from the Stagehand toolkit 