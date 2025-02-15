import { generateText, generateObject } from "ai";
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import { Schemas } from './schemas';

const MODELS = {
  groq: {
    default: "deepseek-r1-distill-llama-70b",
    available: [
      "deepseek-r1-distill-llama-70b",
      "llama2-70b-4096",
      "mixtral-8x7b-32768",
      "llama-3.3-70b-versatile",
      "llama-3.1-8b-instant",
      "gemma2-9b-it"
    ]
  },
  openai: {
    default: "gpt-3.5-turbo",
    available: [
      "gpt-4",
      "gpt-3.5-turbo",
      "gpt-4-turbo-preview"
    ]
  }
};

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
  schemaName: string,
  customPrompt: string | null = null,
  provider = "groq",
  model: string | null = null,
) {
  try {
    const schema = Schemas[schemaName];
    if (!schema) {
      throw new Error(`Schema "${schemaName}" not found. Available schemas: ${Object.keys(Schemas).join(", ")}`);
    }

    const client = provider === "groq" ? groq : openai;
    const selectedModel = model || MODELS[provider].default;

    if (!MODELS[provider].available.includes(selectedModel)) {
      throw new Error(`Invalid model for ${provider}. Available models: ${MODELS[provider].available.join(", ")}`);
    }

    // For podcast transcripts, we'll handle the response differently
    if (schemaName === 'podcast' && customPrompt) {
      const { text } = await generateText({
        model: client(selectedModel),
        prompt: customPrompt,
        stream: false
      });

      // Parse the text response into our expected format
      try {
        // Split the text into segments and parse each one
        const segments = text.split(/\n\s*\n/).filter(Boolean);
        
        const transcript = segments.map(segment => {
          // More flexible pattern matching for different quote styles and whitespace
          const speakerMatch = segment.match(/["']?speaker["']?\s*:\s*["'](Speaker \d)["']/i);
          const textMatch = segment.match(/["']?text["']?\s*:\s*["']([^"']+)["']/);

          if (!speakerMatch || !textMatch) {
            throw new Error(`Invalid segment format: ${segment}`);
          }

          return {
            speaker: speakerMatch[1],
            text: textMatch[1].replace(/\\n/g, ' ').trim()
          };
        });

        // Validate against our schema
        const parsed = schema.parse(transcript);
        return parsed;
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        throw new Error('Failed to parse model response into valid transcript format');
      }
    }

    // For other schema types, use generateObject as before
    const { data } = await generateObject({
      model: client(selectedModel),
      prompt: customPrompt,
      schema,
    });

    return data;
  } catch (error) {
    console.error(`Error generating object with ${provider}:`, error);
    throw error;
  }
}

export { MODELS }; 