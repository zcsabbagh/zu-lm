import { generateText, generateObject } from "ai";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { Schemas } from './schemas';

const MODELS = {
  groq: {
    default: "deepseek-r1-distill-llama-70b" as const,
    available: [
      "deepseek-r1-distill-llama-70b",
      "llama2-70b-4096",
      "mixtral-8x7b-32768",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "gemma2-9b-it"
    ] as const
  },
  openai: {
    default: "gpt-3.5-turbo" as const,
    available: [
      "gpt-4",
      "gpt-3.5-turbo",
      "gpt-4-turbo-preview"
    ] as const
  }
} as const;

type Provider = keyof typeof MODELS;
type ModelType<P extends Provider> = typeof MODELS[P]['available'][number];

export async function createText(
  provider = "groq", 
  prompt = "What is love?", 
  model: string | null = null,
  stream = false
) {
  try {
    const client = provider === "groq" ? groq : openai;
    const selectedModel = model || MODELS[provider].default;

    if (!MODELS[provider].available.includes(selectedModel)) {
      throw new Error(`Invalid model for ${provider}. Available models: ${MODELS[provider].available.join(", ")}`);
    }

    const { text } = await generateText({
      model: client(selectedModel),
      prompt: prompt,
      stream: stream
    });
    return text;
  } catch (error) {
    console.error(`Error generating with ${provider}:`, error);
    throw error;
  }
}

export async function createObject(
  schemaName: keyof typeof Schemas,
  customPrompt: string | null = null,
  provider: Provider = "groq",
  model: ModelType<Provider> | null = null,
) {
  try {
    const schema = Schemas[schemaName];
    if (!schema) {
      throw new Error(`Schema "${schemaName}" not found. Available schemas: ${Object.keys(Schemas).join(", ")}`);
    }

    const client = provider === "groq" ? groq : openai;
    const selectedModel = model || MODELS[provider].default;

    if (!MODELS[provider].available.includes(selectedModel as any)) {
      throw new Error(`Invalid model for ${provider}. Available models: ${MODELS[provider].available.join(", ")}`);
    }

    // For podcast transcripts, we'll handle the response differently
    if (schemaName === 'podcast' && customPrompt) {
      const { text } = await generateText({
        model: client(selectedModel),
        prompt: customPrompt
      });

      // Log the raw response for debugging
      console.log('Raw model response:', text);

      try {
        // First try to parse as JSON directly
        let segments: Array<{ speaker: string; text: string }>;
        try {
          // Clean up the text for JSON parsing
          const cleanedText = text.trim();
          // If it's not already wrapped in brackets, wrap it
          const jsonText = cleanedText.startsWith('[') ? cleanedText : `[${cleanedText}]`;
          // Parse the JSON
          segments = JSON.parse(jsonText);
          console.log('Successfully parsed JSON response');
        } catch (parseError) {
          // If direct JSON parse fails, try to parse each segment individually
          console.log('Direct JSON parse failed, trying segment-by-segment parsing');
          const segmentStrings = text
            .split(/}\s*,\s*{/)
            .map(s => s.replace(/^\s*\[?\s*{?\s*/, '{').replace(/}\s*]\s*$/, '}'));
          
          segments = segmentStrings.map(segment => {
            try {
              return JSON.parse(segment);
            } catch (err) {
              console.log('Failed to parse segment:', segment);
              throw new Error(`Invalid segment format: ${segment}`);
            }
          });
        }

        console.log('Parsed segments:', segments);

        const transcript = segments.map(segment => ({
          speaker: segment.speaker as "Speaker 1" | "Speaker 2",
          text: segment.text.trim()
        }));

        // Validate against our schema
        const parsed = schema.parse(transcript);
        return parsed;
      } catch (error) {
        console.error('Error parsing response:', error);
        console.error('Parse error details:', error instanceof Error ? error.message : String(error));
        throw new Error('Failed to parse model response into valid transcript format');
      }
    }

    // For other schema types, use generateObject
    const result = await generateObject({
      model: client(selectedModel),
      prompt: customPrompt || undefined,
      schema: schema,
    });

    return result;
  } catch (error) {
    console.error(`Error generating object with ${provider}:`, error);
    throw error;
  }
}

export { MODELS }; 