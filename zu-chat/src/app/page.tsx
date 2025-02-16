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

interface SpeakerImage {
  speaker: string;
  imageUrl: string | null;
  error?: string;
}

export default function Home() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [language, setLanguage] = useState<typeof LANGUAGES[number]["value"]>("English");
  const [duration, setDuration] = useState<typeof DURATIONS[number]["value"]>("3");
  const [researchSummary, setResearchSummary] = useState<string | null>(null);
  const [audioSegments, setAudioSegments] = useState<ArrayBuffer[]>([]);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [transcript, setTranscript] = useState<Array<{ speaker: string; text: string }>>([]);
  const [displayedMessages, setDisplayedMessages] = useState<Array<{ role: string; content: string }>>([]);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { messages, setMessages } = useChat();
  const [speakerImages, setSpeakerImages] = useState<SpeakerImage[]>([]);
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Check for research summary in localStorage
    const summary = localStorage.getItem('researchSummary');
    if (summary) {
      setResearchSummary(summary);
      localStorage.removeItem('researchSummary');
    }
  }, []);

  useEffect(() => {
    // Handle audio playback and transcript synchronization
    if (isReady && audioSegments.length > 0 && currentSegment < audioSegments.length) {
      const audio = audioRef.current;
      if (audio) {
        const blob = new Blob([audioSegments[currentSegment]], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        audio.src = url;
        
        // Start playing automatically
        audio.play().catch(error => {
          console.error('Error playing audio:', error);
        });
        
        // Display the current segment's transcript
        setDisplayedMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `${transcript[currentSegment].speaker}: ${transcript[currentSegment].text}`,
          }
        ]);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          if (currentSegment < audioSegments.length - 1) {
            setCurrentSegment(prev => prev + 1);
          }
        };
      }
    }
  }, [audioSegments, currentSegment, transcript, isReady]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setIsReady(false);
    setDisplayedMessages([]); // Clear previous messages
    setCurrentSegment(0); // Reset segment counter
    setSpeakerImages([]); // Clear previous images
    try {
      // Generate podcast audio
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
      const segments = data.audioSegments.map((base64Audio: string) => {
        try {
          const binaryString = atob(base64Audio);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          return bytes.buffer;
        } catch (error) {
          console.error('Error decoding audio segment:', error);
          throw new Error('Failed to decode audio data');
        }
      });

      setAudioSegments(segments);
      setTranscript(data.transcript);

      // Generate images for all segments
      setIsGeneratingImages(true);
      try {
        const imageResponse = await fetch('/api/generate/images', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transcript: data.transcript,
          }),
        });

        if (!imageResponse.ok) {
          throw new Error('Failed to generate images');
        }

        const imageData = await imageResponse.json();
        if (imageData.error) {
          throw new Error(imageData.error);
        }

        setSpeakerImages(imageData.images);
        // Set ready state after both audio and images are generated
        setIsReady(true);
      } catch (error) {
        console.error('Error generating images:', error);
        // Even if image generation fails, we can still proceed with audio
        setIsReady(true);
      } finally {
        setIsGeneratingImages(false);
      }

      setResearchSummary(null);
    } catch (error) {
      console.error('Generation error:', error);
      alert(error instanceof Error ? error.message : 'Failed to generate podcast');
    } finally {
      setIsGenerating(false);
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

      <audio ref={audioRef} className="hidden" />

      {displayedMessages.length > 0 && (
        <div className="mt-6">
          <div className="space-y-4">
            {displayedMessages.map((message, index) => {
              if (message.role === 'assistant') {
                const speakerImage = speakerImages[index];
                return (
                  <div key={index} className="flex gap-4 items-start">
                    <div className="w-32 flex-shrink-0">
                      {speakerImage?.imageUrl ? (
                        <img
                          src={speakerImage.imageUrl}
                          alt={`${speakerImage.speaker} speaking`}
                          className="w-full h-32 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-full h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                          {isGeneratingImages ? (
                            <div className="text-sm text-gray-500">Generating...</div>
                          ) : (
                            <div className="text-sm text-gray-500">No image</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex-grow">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-800">{message.content}</p>
                      </div>
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
