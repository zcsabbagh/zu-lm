'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface StatusUpdate {
  phase: string;
  message: string;
  elapsed_time: number;
  timestamp: number;
  summary?: string;
}

interface StatusMessage {
  phase: string;
  message: string;
  timestamp: number;
}

const formatMessage = (message: string) => {
  // Remove the phase prefix if it exists
  const cleanMessage = message.replace(/^\[[^\]]+\]\s*/, '');
  
  // If the message contains <think>, format it specially
  if (cleanMessage.includes('<think>')) {
    const thinkingContent = cleanMessage.split('<think>')[1].split('</think>')[0].trim();
    return (
      <div className="bg-blue-50 p-3 rounded-md my-2">
        <div className="text-blue-600 font-medium mb-1">Thinking Process:</div>
        <div className="whitespace-pre-wrap text-sm text-gray-700">{thinkingContent}</div>
      </div>
    );
  }

  // If it's JSON, try to format it
  if (cleanMessage.includes('{') && cleanMessage.includes('}')) {
    try {
      const jsonStart = cleanMessage.indexOf('{');
      const jsonEnd = cleanMessage.lastIndexOf('}') + 1;
      const jsonStr = cleanMessage.slice(jsonStart, jsonEnd);
      const jsonObj = JSON.parse(jsonStr);
      const beforeJson = cleanMessage.slice(0, jsonStart);
      const afterJson = cleanMessage.slice(jsonEnd);
      
      return (
        <div>
          {beforeJson && <div>{beforeJson}</div>}
          <pre className="bg-gray-100 p-2 rounded-md my-1 text-sm">
            {JSON.stringify(jsonObj, null, 2)}
          </pre>
          {afterJson && <div>{afterJson}</div>}
        </div>
      );
    } catch (e) {
      // If JSON parsing fails, just return the original message
      return cleanMessage;
    }
  }

  return cleanMessage;
};

export default function ResearchPage() {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState('');
  const [phase, setPhase] = useState('');
  const [statusHistory, setStatusHistory] = useState<StatusMessage[]>([]);
  const [statusSource, setStatusSource] = useState<EventSource | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const router = useRouter();
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // 1 second

  const BACKEND_URL = process.env.NEXT_PUBLIC_RESEARCHER_URL || 'http://localhost:4000';

  useEffect(() => {
    // Cleanup function to close SSE connection when component unmounts
    return () => {
      if (statusSource) {
        statusSource.close();
      }
    };
  }, [statusSource]);

  const setupSSEConnection = () => {
    if (statusSource) {
      statusSource.close();
    }

    const eventSource = new EventSource(`${BACKEND_URL}/status`, {
      withCredentials: true
    });

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as StatusUpdate;
        console.log('Received status update:', data);
        
        setStatus(data.message);
        setPhase(data.phase);
        setRetryCount(0); // Reset retry count on successful message
        
        // Add to status history
        setStatusHistory(prev => [...prev, {
          phase: data.phase,
          message: data.message,
          timestamp: data.timestamp,
        }]);
        
        if (data.phase === 'complete') {
          setSummary(data.message);
          eventSource.close();
          setStatusSource(null);
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to parse SSE data:', error, event.data);
      }
    };

    eventSource.onerror = async (error) => {
      console.error('SSE error:', error);
      eventSource.close();
      
      if (retryCount < MAX_RETRIES) {
        console.log(`Retrying SSE connection (${retryCount + 1}/${MAX_RETRIES})...`);
        setRetryCount(prev => prev + 1);
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * Math.pow(2, retryCount)));
        setupSSEConnection();
      } else {
        setStatusSource(null);
        setIsLoading(false);
        setStatus('Error: Lost connection to research service');
        setStatusHistory(prev => [...prev, {
          phase: 'error',
          message: 'Lost connection to research service',
          timestamp: Date.now() / 1000,
        }]);
      }
    };

    eventSource.onopen = async () => {
      console.log('SSE connection opened');
      setStatusSource(eventSource);
      setRetryCount(0);
    };

    return eventSource;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSummary('');
    setStatus('Starting research...');
    setPhase('');
    setStatusHistory([]);
    setRetryCount(0);

    try {
      // First establish SSE connection
      const eventSource = setupSSEConnection();
      
      // Wait for connection to be established
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('SSE connection timeout'));
        }, 5000);

        eventSource.onopen = () => {
          clearTimeout(timeout);
          resolve();
        };
      });

      // Now start the research process
      const response = await fetch(`${BACKEND_URL}/research`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic }),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Research request failed');
      }
    } catch (error) {
      console.error('Research error:', error);
      setIsLoading(false);
      setStatus('Error: Failed to start research');
      setStatusHistory(prev => [...prev, {
        phase: 'error',
        message: 'Failed to start research',
        timestamp: Date.now() / 1000,
      }]);

      if (statusSource) {
        statusSource.close();
        setStatusSource(null);
      }
    }
  };

  const handleCreatePodcast = () => {
    // Store the research summary in localStorage
    localStorage.setItem('researchSummary', summary);
    // Navigate to the podcast creation page
    router.push('/');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Research Assistant</h1>
      
      <form onSubmit={handleSubmit} className="mb-8">
        <div className="mb-4">
          <label htmlFor="topic" className="block text-sm font-medium mb-2">
            Research Topic
          </label>
          <input
            type="text"
            id="topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full p-2 border rounded-md"
            placeholder="Enter a topic to research..."
            disabled={isLoading}
          />
        </div>
        <button
          type="submit"
          disabled={isLoading || !topic}
          className="bg-blue-500 text-white px-4 py-2 rounded-md disabled:bg-gray-400"
        >
          {isLoading ? 'Researching...' : 'Start Research'}
        </button>
      </form>

      {(status || phase) && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Current Status</h2>
          {phase && (
            <div className="text-sm text-gray-500 mb-1">
              Phase: {phase}
            </div>
          )}
          <div className="text-gray-700">{formatMessage(status)}</div>
        </div>
      )}

      {statusHistory.length > 0 && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Research Progress</h2>
          <div className="bg-gray-50 p-4 rounded-md max-h-[500px] overflow-y-auto">
            {statusHistory.map((status, index) => (
              <div key={index} className="mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500">
                    [{new Date(status.timestamp * 1000).toLocaleTimeString()}]
                  </span>
                  <span className="text-xs font-medium px-2 py-1 bg-gray-200 rounded-full">
                    {status.phase}
                  </span>
                </div>
                <div className={`ml-4 ${status.phase === 'error' ? 'text-red-600' : 'text-gray-700'}`}>
                  {formatMessage(status.message)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary && (
        <div className="mb-4">
          <h2 className="text-lg font-semibold mb-2">Research Summary</h2>
          <div className="bg-gray-50 p-4 rounded-md">
            <p className="whitespace-pre-wrap">{summary}</p>
          </div>
          <button
            onClick={handleCreatePodcast}
            className="mt-4 bg-green-500 text-white px-4 py-2 rounded-md"
          >
            Create Podcast from Research
          </button>
        </div>
      )}
    </div>
  );
} 