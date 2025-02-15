'use client';

import { useState } from 'react';
import { Chat } from '@/components/Chat';
import { useChat } from 'ai/react';

const LANGUAGES = [
  { value: "English", label: "English" },
  { value: "Spanish", label: "Spanish" },
  { value: "Chinese", label: "Chinese" },
  { value: "Russian", label: "Russian" },
  { value: "Arabic", label: "Arabic" },
  { value: "Japanese", label: "Japanese" },
  { value: "Korean", label: "Korean" },
  { value: "French", label: "French" },
  { value: "German", label: "German" },
  { value: "Italian", label: "Italian" },
  { value: "Portuguese", label: "Portuguese" },
] as const;

const DURATIONS = [
  { value: "1", label: "1 minute" },
  { value: "2", label: "2 minutes" },
  { value: "3", label: "3 minutes" },
  { value: "5", label: "5 minutes" },
] as const;

export default function Home() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [language, setLanguage] = useState<typeof LANGUAGES[number]["value"]>("English");
  const [duration, setDuration] = useState<typeof DURATIONS[number]["value"]>("3");
  const { messages, setMessages } = useChat();

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language,
          minutes: duration,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate podcast');
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        const lines = text.split('\n').filter(line => line.trim());
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(5);
            try {
              const parsed = JSON.parse(data);
              setMessages(prev => [...prev, { role: 'assistant', content: parsed.content }]);
            } catch (e) {
              console.error('Failed to parse message:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8 text-center">Arsenal Invincibles Podcast</h1>
        
        <div className="w-full max-w-2xl mx-auto">
          <div className="mb-6 flex gap-4 justify-center">
            <div className="flex flex-col">
              <label htmlFor="language" className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                Language
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as typeof language)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                disabled={isGenerating}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col">
              <label htmlFor="duration" className="mb-2 text-sm font-medium text-gray-900 dark:text-white">
                Duration
              </label>
              <select
                id="duration"
                value={duration}
                onChange={(e) => setDuration(e.target.value as typeof duration)}
                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white"
                disabled={isGenerating}
              >
                {DURATIONS.map((dur) => (
                  <option key={dur.value} value={dur.value}>
                    {dur.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Chat messages={messages} isLoading={isGenerating} />
          
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleGenerate}
              disabled={isGenerating}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? 'Generating...' : 'Generate Podcast'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
