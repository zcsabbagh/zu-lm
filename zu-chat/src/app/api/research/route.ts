import { NextResponse } from 'next/server';

const RESEARCHER_URL = process.env.RESEARCHER_URL || 'http://localhost:4000';

export async function POST(req: Request) {
  const origin = req.headers.get('origin') || 'http://localhost:3000';

  try {
    const body = await req.json();
    console.log('Forwarding research request:', body);

    const response = await fetch(`${RESEARCHER_URL}/research`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      credentials: 'include',
    });

    if (!response.ok) {
      console.error('Research service error:', response.status, response.statusText);
      throw new Error(`Research request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    return NextResponse.json(data, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
      },
    });
  } catch (error) {
    console.error('Research error:', error);
    
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to start research',
        timestamp: Date.now(),
        details: error instanceof Error ? error.cause : undefined
      },
      { 
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Credentials': 'true',
        }
      }
    );
  }
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin') || 'http://localhost:3000';
  
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Max-Age': '86400', // 24 hours
    },
  });
} 