import { NextResponse } from 'next/server';

const RESEARCHER_URL = process.env.RESEARCHER_URL || 'http://localhost:4000';

export async function GET(req: Request) {
  const origin = req.headers.get('origin') || 'http://localhost:3000';

  try {
    console.log('Attempting to connect to research service at:', RESEARCHER_URL);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    const response = await fetch(`${RESEARCHER_URL}/status`, {
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      signal: controller.signal,
      credentials: 'include',
    });

    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.error('Research service responded with status:', response.status);
      throw new Error(`Failed to connect to status stream: ${response.status} ${response.statusText}`);
    }

    if (!response.body) {
      console.error('No response body received from research service');
      throw new Error('No response body received from research service');
    }

    // Forward the SSE stream with proper headers
    const headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Cache-Control, Last-Event-ID',
      'X-Accel-Buffering': 'no', // Disable proxy buffering
    });

    return new Response(response.body, { 
      headers,
      status: 200,
    });
  } catch (error) {
    console.error('Status stream error:', error);
    
    // Return error response with CORS headers
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to connect to status stream',
        timestamp: Date.now(),
        details: error instanceof Error ? error.cause : undefined
      }),
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        }
      }
    );
  }
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin') || 'http://localhost:3000';
  
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, Cache-Control, Last-Event-ID',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
} 