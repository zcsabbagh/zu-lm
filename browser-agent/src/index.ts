import { Stagehand } from "@browserbasehq/stagehand";
import {
  StagehandActTool,
  StagehandNavigateTool,
} from "@langchain/community/agents/toolkits/stagehand";
import { ChatOpenAI } from "@langchain/openai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";

export class BrowserAgent {
  private stagehand: Stagehand;
  private agent: any; // Type will be inferred from createReactAgent
  private publicUrl: string | null = null;

  constructor() {
    this.stagehand = new Stagehand({
      env: "LOCAL",
      enableCaching: true,
    });

    const actTool = new StagehandActTool(this.stagehand);
    const navigateTool = new StagehandNavigateTool(this.stagehand);

    const model = new ChatOpenAI({
      modelName: "gpt-4",
      temperature: 0,
    });

    this.agent = createReactAgent({
      llm: model,
      tools: [actTool, navigateTool],
    });
  }

  private async handleStream(stream: AsyncGenerator<any, any, unknown>) {
    for await (const { messages } of stream) {
      const msg =
        messages && messages.length > 0
          ? messages[messages.length - 1]
          : undefined;
      if (msg?.content) {
        console.log("[Browser Agent]", msg.content);
      } else if (msg?.tool_calls && msg.tool_calls.length > 0) {
        console.log("[Browser Agent] Tool calls:", msg.tool_calls);
      } else {
        console.log("[Browser Agent]", msg);
      }
    }
  }

  async getPublicUrl(): Promise<string> {
    if (!this.publicUrl) {
      this.publicUrl = await this.stagehand.getPublicUrl();
    }
    return this.publicUrl;
  }

  async performSearch(query: string) {
    // First get and print the public URL
    const publicUrl = await this.getPublicUrl();
    console.log("\n[Browser Agent] Watch the automation at:", publicUrl);

    // Navigate to Google
    console.log("\n[Browser Agent] Navigating to Google...");
    const inputs1 = {
      messages: [
        {
          role: "user",
          content: "Navigate to https://www.google.com",
        },
      ],
    };

    const stream1 = await this.agent.stream(inputs1, {
      streamMode: "values",
    });
    await this.handleStream(stream1);

    // Perform the search
    console.log("\n[Browser Agent] Searching for:", query);
    const inputs2 = {
      messages: [
        {
          role: "user",
          content: `Search for '${query}'`,
        },
      ],
    };

    const stream2 = await this.agent.stream(inputs2, {
      streamMode: "values",
    });
    await this.handleStream(stream2);

    return publicUrl;
  }
}

// Export a function to create and use the agent
export async function createBrowserAgent(): Promise<BrowserAgent> {
  return new BrowserAgent();
}

// If running directly, demonstrate usage
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = await createBrowserAgent();
  try {
    await agent.performSearch("OpenAI");
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
} 