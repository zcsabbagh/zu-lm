'use client';

import { useState, useEffect, useRef } from 'react';
import { useChat } from 'ai/react';
import Link from 'next/link';
import { PodcastControls } from '@/components/podcast/PodcastControls';
import { PodcastPlayer } from '@/components/podcast/PodcastPlayer';
import { ResearchHeader } from '@/components/research/ResearchHeader';
import { ResearchPerspectives } from '@/components/research/ResearchPerspectives';
import { DEFAULT_RESEARCH_SUMMARY } from '@/lib/constants';

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
  const [isTestMode, setIsTestMode] = useState(false);

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
        // Stop any current playback
        audio.pause();
        
        // Create and play the new segment
        const blob = new Blob([audioSegments[currentSegment]], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        audio.src = url;
        
        // Start playing automatically
        audio.play().catch(error => {
          console.error('Error playing audio:', error);
        });

        // Clean up previous URL if it exists
        if (audio.dataset.previousUrl) {
          URL.revokeObjectURL(audio.dataset.previousUrl);
        }
        audio.dataset.previousUrl = url;

        // Update displayed message if not already shown
        if (!displayedMessages[currentSegment]) {
          setDisplayedMessages(prev => {
            const newMessages = [...prev];
            newMessages[currentSegment] = {
              role: 'assistant',
              content: `${transcript[currentSegment].speaker}: ${transcript[currentSegment].text}`,
            };
            return newMessages;
          });
        }

        audio.onended = () => {
          if (currentSegment < audioSegments.length - 1) {
            setCurrentSegment(prev => prev + 1);
          }
        };

        // Cleanup function
        return () => {
          audio.pause();
          if (audio.dataset.previousUrl) {
            URL.revokeObjectURL(audio.dataset.previousUrl);
          }
        };
      }
    }
  }, [audioSegments, currentSegment, transcript, isReady, displayedMessages]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    setIsReady(false);
    setDisplayedMessages([]);
    setCurrentSegment(0);
    setSpeakerImages([]);
    
    try {
      const researchSummary = selectedTrack === 'one' ? trackOne : trackTwo;

      // Generate podcast audio
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          language,
          minutes: duration,
          researchSummary: researchSummary || DEFAULT_RESEARCH_SUMMARY,
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
      <ResearchHeader title="Podcast Generator" />

      {(trackOne || trackTwo) && (
        <ResearchPerspectives
          trackOne={trackOne}
          trackTwo={trackTwo}
          selectedTrack={selectedTrack}
          onSelectTrack={setSelectedTrack}
        />
      )}

      <PodcastControls
        language={language}
        duration={duration}
        isGenerating={isGenerating}
        onLanguageChange={setLanguage}
        onDurationChange={setDuration}
        onGenerate={handleGenerate}
      />

      <audio ref={audioRef} className="hidden" />

      {displayedMessages.length > 0 && (
        <div className="mt-6">
          <PodcastPlayer
            content={displayedMessages[currentSegment]?.content}
            imageUrl={speakerImages[currentSegment]?.imageUrl}
            audioRef={audioRef}
            currentSegment={currentSegment}
            totalSegments={displayedMessages.length}
            onNext={() => {
              if (currentSegment < displayedMessages.length - 1) {
                setCurrentSegment(prev => prev + 1);
              }
            }}
            onPrevious={() => {
              if (currentSegment > 0) {
                setCurrentSegment(prev => prev - 1);
              }
            }}
          />

            
        </div>
      )}
    </div>
  );
}
