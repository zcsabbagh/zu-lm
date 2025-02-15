import { NextResponse } from 'next/server';

const RESEARCHER_URL = process.env.RESEARCHER_URL || 'http://localhost:3000';

export async function GET(req: Request) {
  try {
    const response = await fetch(`${RESEARCHER_URL}/status`, {
      headers: {
        'Accept': 'text/event-stream',
      },
    });
    
    if (!response.ok) {
      throw new Error('Failed to connect to status stream');
    }

    // Forward the SSE stream directly
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Status stream error:', error);
    return NextResponse.json(
      { error: 'Failed to connect to status stream' },
      { status: 500 }
    );
  }
} 