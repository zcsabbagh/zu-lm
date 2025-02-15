'use client';

import { useState, useEffect, useRef } from 'react';
import { Chat } from '@/components/Chat';
import { useChat } from 'ai/react';
import Link from 'next/link';

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
  const [researchSummary, setResearchSummary] = useState<string | null>(null);
  const [audioSegments, setAudioSegments] = useState<ArrayBuffer[]>([]);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { messages, setMessages } = useChat();

  useEffect(() => {
    // Check for research summary in localStorage
    const summary = localStorage.getItem('researchSummary');
    if (summary) {
      setResearchSummary(summary);
      localStorage.removeItem('researchSummary'); // Clear it after reading
    }
  }, []);

  useEffect(() => {
    // Handle audio playback
    if (audioSegments.length > 0 && currentSegment < audioSegments.length && isPlaying) {
      const audio = audioRef.current;
      if (audio) {
        const blob = new Blob([audioSegments[currentSegment]], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        audio.src = url;
        audio.play();
        
        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (currentSegment < audioSegments.length - 1) {
            setCurrentSegment(prev => prev + 1);
          } else {
            setIsPlaying(false);
            setCurrentSegment(0);
          }
        };
      }
    }
  }, [audioSegments, currentSegment, isPlaying]);

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
          researchSummary,
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate podcast');
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      // Convert base64 audio segments to ArrayBuffer
      const segments = data.audioSegments.map((segment: string) => {
        const binaryString = atob(segment);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
      });

      setAudioSegments(segments);
      setMessages(data.transcript.map((segment: any) => ({
        role: 'assistant',
        content: `${segment.speaker}: ${segment.text}`,
      })));

      // Clear the research summary after using it
      setResearchSummary(null);
    } catch (error) {
      console.error('Generation error:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Podcast Generator</h1>
        <Link
          href="/research"
          className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
        >
          Research New Topic
        </Link>
      </div>

      {researchSummary && (
        <div className="mb-6 p-4 bg-green-50 rounded-md">
          <h2 className="text-lg font-semibold mb-2">Research Summary Available</h2>
          <p className="text-sm text-gray-600 mb-2">A research summary is ready to be used for podcast generation.</p>
          <div className="bg-white p-3 rounded-md">
            <p className="text-sm">{researchSummary.substring(0, 200)}...</p>
          </div>
        </div>
      )}

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Language</label>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as typeof language)}
          className="w-full p-2 border rounded-md"
          disabled={isGenerating}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">Duration</label>
        <select
          value={duration}
          onChange={(e) => setDuration(e.target.value as typeof duration)}
          className="w-full p-2 border rounded-md"
          disabled={isGenerating}
        >
          {DURATIONS.map((dur) => (
            <option key={dur.value} value={dur.value}>
              {dur.label}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="w-full bg-blue-500 text-white px-4 py-2 rounded-md disabled:bg-gray-400"
      >
        {isGenerating ? 'Generating...' : 'Generate Podcast'}
      </button>

      {audioSegments.length > 0 && (
        <div className="mt-6">
          <audio ref={audioRef} className="hidden" />
          <button
            onClick={handlePlayPause}
            className="w-full bg-green-500 text-white px-4 py-2 rounded-md"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
        </div>
      )}

      {messages.length > 0 && (
        <div className="mt-6">
          <Chat messages={messages} />
        </div>
      )}
    </div>
  );
}
