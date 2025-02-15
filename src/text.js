import { generateText } from "ai"
import { groq } from "@ai-sdk/groq";
import { openai } from "@ai-sdk/openai";
import dotenv from "dotenv";
import { generateObject } from 'ai';
import { createOpenAI as createGroq } from '@ai-sdk/openai';
// import { playPodcastTranscript } from "./voice-helpers.js";

dotenv.config();

import { z } from 'zod';

// const groq = createGroq({
//   baseURL: 'https://api.groq.com/openai/v1',
//   apiKey: process.env.GROQ_API_KEY,
// });



const { object } = await generateObject({
  model: groq('llama-3.1-70b-versatile'),
  schema: z.object({
    recipe: z.object({
      name: z.string(),
      ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
      steps: z.array(z.string()),
    }),
  }),
  prompt: 'Generate a lasagna recipe.',
});

const GROQ_MODELS = [
    "deepseek-r1-distill-llama-70b",
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
    "mixtral-8x7b-32768"
]

async function createText(
  provider = "groq", 
  prompt = "What is love?", 
  model = "deepseek-r1-distill-llama-70b",
  stream = true
) {
  try {
    if (provider === "groq") {

       if (stream) {
        const { textStream } = streamText({
            model: groq(model),
            prompt: prompt,
            stream: stream
        })
        return textStream;
       } else {
        const { text } = await generateText({
            model: groq(model),
            prompt: prompt,
            stream: stream
        })
        return text;
       }

    } else if (provider === "openai")    {
        const { text } = await generateText({
            model: openai(model),
            prompt: prompt,
            stream: stream
        })
        return text;
    }

  } catch (error) {
    console.error('Error generating with Groq:', error);
    throw error;
  }
}

createText("groq", "What is love?", "deepseek-r1-distill-llama-70b", true)
  .then(response => console.log(response))
  .catch(error => console.error(error));

// createText("openai", "What is love?", "gpt-4o")
//   .then(response => console.log(response))
//   .catch(error => console.error(error));
