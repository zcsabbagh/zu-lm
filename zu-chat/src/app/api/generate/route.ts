import { createObject } from '@/lib/text';
import { getPodcastPrompt } from '@/lib/schemas';
import { ElevenLabsClient } from "elevenlabs";
import { Readable } from 'stream';

interface PodcastSegment {
  speaker: "Speaker 1" | "Speaker 2";
  text: string;
}

const VOICE_IDS = {
  "Speaker 1": "JBFqnCBsd6RMkjVDRZzb",
  "Speaker 2": "ZF6FPAbjXT4488VcRRnw"
} as const;

// Helper function to convert stream to buffer
async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// Initialize the client outside the handler to reuse the connection
const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY || '',
});

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const { language = "English", minutes = "3", researchSummary } = await req.json();

  // Start the async process
  (async () => {
    try {
      const content = researchSummary || `
## Summary 
Arsenal's 2003-04 season, famously referred to as "The Invincibles," was a remarkable achievement in English football. The team dominated the Premier League, securing an impressive 26 wins with no losses, finishing 11 points ahead of second-placed Chelsea. Their total of 73 goals scored and only 26 conceded highlighted their offensive strength and defensive resilience. Key players played pivotal roles in this success. Thierry Henry led the charge, scoring 30 goals in the Premier League. Robert Pires contributed with 14 goals, while Patrick Vieira added 3 goals and 4 assists, showcasing his midfield influence. Freddie Ljungberg scored 4 crucial goals, and Jens Lehmann's consistent performances between the posts were vital, playing every minute of all 38 matches. Defensively, Kolo Touré stood out with 55 appearances, while Ashley Cole's contributions on the left flank were significant, aiding in both goals and assists. Dennis Bergkamp's presence added experience and versatility to the squad. This season was not just about individual brilliance but also teamwork, exemplified by the cohesive effort of players and staff. The legacy of "The Invincibles" remains a testament to Arsenal's ability to unite talent and determination, cementing their status as one of the Premier League's most successful sides. 
`;

      const prompt = getPodcastPrompt(content, language, minutes);
      console.log('Generated prompt:', prompt);

      const podcast_transcript = await createObject("podcast", prompt, "groq", "llama-3.1-8b-instant");
      console.log('Raw podcast transcript response:', JSON.stringify(podcast_transcript, null, 2));

      if (!Array.isArray(podcast_transcript)) {
        console.error('Podcast transcript is not an array:', podcast_transcript);
        throw new Error('Invalid podcast transcript format - expected array');
      }

      // Generate all audio segments in parallel
      const audioPromises = podcast_transcript.map(async (segment) => {
        console.log(`Preparing segment:`, segment);
        const voiceId = VOICE_IDS[segment.speaker];
        if (!voiceId) {
          console.error('Invalid speaker:', segment.speaker);
          throw new Error(`No voice ID found for ${segment.speaker}`);
        }
        
        try {
          // Use the ElevenLabs client to get the audio stream
          const audioStream = await client.textToSpeech.convert(voiceId, {
            text: segment.text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
            output_format: "mp3_44100_128",
          });

          // Convert the stream to a buffer
          const audioBuffer = await streamToBuffer(audioStream as unknown as Readable);
          
          // Convert the buffer to base64
          return audioBuffer.toString('base64');
        } catch (error: unknown) {
          console.error(`Error generating audio for segment:`, error);
          throw new Error(`Failed to generate audio for segment: ${error instanceof Error ? error.message : String(error)}`);
        }
      });

      // Wait for all audio segments to complete
      const audioSegments = await Promise.all(audioPromises);
      console.log(`Successfully generated ${audioSegments.length} audio segments`);
      
      // Send the audio segments and transcript as response
      await writer.write(encoder.encode(JSON.stringify({
        audioSegments,
        transcript: podcast_transcript,
      })));
    } catch (error: unknown) {
      console.error('Error generating podcast:', error);
      console.error('Error details:', error instanceof Error ? error.message : String(error));
      await writer.write(encoder.encode(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Failed to generate podcast'
      })));
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
} 