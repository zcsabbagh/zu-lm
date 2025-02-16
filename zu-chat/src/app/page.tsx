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
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [language, setLanguage] = useState("English");
  const [duration, setDuration] = useState("3");
  const [audioSegments, setAudioSegments] = useState<ArrayBuffer[]>([]);
  const [transcript, setTranscript] = useState<any[]>([]);
  const [currentSegment, setCurrentSegment] = useState(0);
  const [displayedMessages, setDisplayedMessages] = useState<any[]>([]);
  const [speakerImages, setSpeakerImages] = useState<any[]>([]);
  const [trackOne, setTrackOne] = useState<string | null>(null);
  const [trackTwo, setTrackTwo] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<'one' | 'two'>('one');
  const audioRef = useRef<HTMLAudioElement>(null);
  const { messages, setMessages } = useChat();

  useEffect(() => {
    // Load research summaries from localStorage
    const trackOne = localStorage.getItem('researchSummaryTrackOne');
    const trackTwo = localStorage.getItem('researchSummaryTrackTwo');
    if (trackOne) setTrackOne(trackOne);
    if (trackTwo) setTrackTwo(trackTwo);
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
    setDisplayedMessages([]);
    setCurrentSegment(0);
    setSpeakerImages([]);
    
    try {
      const researchSummary = selectedTrack === 'one' ? trackOne : trackTwo;
      if (!researchSummary) {
        throw new Error('No research summary available');
      }

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
        setIsReady(true);
      } catch (error) {
        console.error('Error generating images:', error);
        setIsReady(true);
      } finally {
        setIsGeneratingImages(false);
      }

      // Clear the research summaries after successful generation
      localStorage.removeItem('researchSummaryTrackOne');
      localStorage.removeItem('researchSummaryTrackTwo');
      setTrackOne(null);
      setTrackTwo(null);
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

      {(trackOne || trackTwo) && (
        <div className="mb-6 space-y-4">
          <h2 className="text-xl font-semibold">Research Perspectives</h2>
          <div className="flex gap-4">
            <button
              onClick={() => setSelectedTrack('one')}
              className={`px-4 py-2 rounded-md ${
                selectedTrack === 'one' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-700'
              }`}
              disabled={!trackOne}
            >
              Perspective One
            </button>
            <button
              onClick={() => setSelectedTrack('two')}
              className={`px-4 py-2 rounded-md ${
                selectedTrack === 'two' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-700'
              }`}
              disabled={!trackTwo}
            >
              Perspective Two
            </button>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-md">
            <h3 className="font-medium mb-2">
              {selectedTrack === 'one' ? 'Perspective One' : 'Perspective Two'}
            </h3>
            <div className="prose max-w-none">
              {selectedTrack === 'one' ? trackOne : trackTwo}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
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
          
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">Duration (minutes)</label>
            <select
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
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
        </div>

        <button
          onClick={handleGenerate}
          disabled={isGenerating || (!trackOne && !trackTwo)}
          className="w-full bg-blue-500 text-white px-4 py-2 rounded-md disabled:bg-gray-400"
        >
          {isGenerating ? 'Generating...' : 'Generate Podcast'}
        </button>
      </div>

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
