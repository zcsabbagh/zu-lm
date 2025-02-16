import { NextResponse } from 'next/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const MODEL = 'mixtral-8x7b-32768';

const ENRICHMENT_PROMPT = `You are a knowledgeable assistant that provides additional context and information about topics. Given the following text, provide detailed, interesting, and relevant additional information that would help someone better understand the topic. Include historical context, related concepts, and interesting facts.

Text to enrich: {text}

Provide your response in a clear, well-structured format with markdown headings and bullet points where appropriate.`;

export async function POST(req: Request) {
  try {
    const { text } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    if (!GROQ_API_KEY) {
      return NextResponse.json(
        { error: 'Groq API key is not configured' },
        { status: 500 }
      );
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a knowledgeable assistant that provides rich context and detailed information.'
          },
          {
            role: 'user',
            content: ENRICHMENT_PROMPT.replace('{text}', text)
          }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq API error: ${error}`);
    }

    const data = await response.json();
    const enrichedContent = data.choices[0].message.content;

    return NextResponse.json({ enrichedContent });
  } catch (error) {
    console.error('Enrichment error:', error);
    return NextResponse.json(
      { error: 'Failed to enrich text' },
      { status: 500 }
    );
  }
} 