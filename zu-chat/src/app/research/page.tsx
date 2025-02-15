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

export default function ResearchPage() {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState('');
  const [phase, setPhase] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSummary('');
    setStatus('Starting research...');
    setPhase('');
    
    try {
      // Start the research process
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ topic }),
      });

      if (!response.ok) {
        throw new Error('Research request failed');
      }

      // Set up SSE connection for status updates
      const eventSource = new EventSource('/api/research/status');
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as StatusUpdate;
          setStatus(data.message);
          setPhase(data.phase);
          
          if (data.summary) {
            setSummary(data.summary);
            eventSource.close();
            setIsLoading(false);
          }
        } catch (error) {
          console.error('Failed to parse SSE data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();
        setIsLoading(false);
        setStatus('Error: Lost connection to research service');
      };
    } catch (error) {
      console.error('Research error:', error);
      setIsLoading(false);
      setStatus('Error: Failed to start research');
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
          <h2 className="text-lg font-semibold mb-2">Status</h2>
          {phase && (
            <div className="text-sm text-gray-500 mb-1">
              Phase: {phase}
            </div>
          )}
          <p className="text-gray-700">{status}</p>
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