import { createObject } from '@/lib/text';
import { getPodcastPrompt, verifyPodcast } from '@/lib/schemas';
import { ElevenLabsClient, play } from "elevenlabs";

interface PodcastSegment {
  speaker: "Speaker 1" | "Speaker 2";
  text: string;
}

const VOICE_IDS = {
  "Speaker 1": "JBFqnCBsd6RMkjVDRZzb",
  "Speaker 2": "ZF6FPAbjXT4488VcRRnw"
} as const;

const client = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

const report = `
## Summary 
Arsenal's 2003-04 season, famously referred to as "The Invincibles," was a remarkable achievement in English football. The team dominated the Premier League, securing an impressive 26 wins with no losses, finishing 11 points ahead of second-placed Chelsea. Their total of 73 goals scored and only 26 conceded highlighted their offensive strength and defensive resilience. Key players played pivotal roles in this success. Thierry Henry led the charge, scoring 30 goals in the Premier League. Robert Pires contributed with 14 goals, while Patrick Vieira added 3 goals and 4 assists, showcasing his midfield influence. Freddie Ljungberg scored 4 crucial goals, and Jens Lehmann's consistent performances between the posts were vital, playing every minute of all 38 matches. Defensively, Kolo Touré stood out with 55 appearances, while Ashley Cole's contributions on the left flank were significant, aiding in both goals and assists. Dennis Bergkamp's presence added experience and versatility to the squad. This season was not just about individual brilliance but also teamwork, exemplified by the cohesive effort of players and staff. The legacy of "The Invincibles" remains a testament to Arsenal's ability to unite talent and determination, cementing their status as one of the Premier League's most successful sides. 
`;

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  const { language = "English", minutes = "3" } = await req.json();

  // Start the async process
  (async () => {
    try {
      const prompt = getPodcastPrompt(report, language, minutes);
      console.log('Generated prompt:', prompt);

      const podcast_transcript = await createObject("podcast", prompt, "groq", "llama-3.1-8b-instant") as PodcastSegment[];
      console.log('Generated podcast transcript:', JSON.stringify(podcast_transcript, null, 2));

      // Generate all audio segments in parallel
      const audioPromises = podcast_transcript.map((segment, index) => {
        console.log(`Processing segment ${index}:`, segment);
        const voiceId = VOICE_IDS[segment.speaker];
        if (!voiceId) {
          throw new Error(`No voice ID found for ${segment.speaker}`);
        }
        
        return client.textToSpeech.convert(voiceId, {
          text: segment.text,
          model_id: "eleven_multilingual_v2", 
          output_format: "mp3_44100_128",
        });
      });

      // Wait for all audio segments to be generated
      const audioSegments = await Promise.all(audioPromises);
      console.log(`Generated ${audioSegments.length} audio segments`);

      // Play each segment sequentially and send text as it's played
      for (let i = 0; i < audioSegments.length; i++) {
        console.log(`Playing segment ${i}:`, podcast_transcript[i]);
        // Send the text segment to the client
        const message = {
          role: 'assistant',
          content: `${podcast_transcript[i].speaker}: ${podcast_transcript[i].text}`,
        };
        await writer.write(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
        
        // Play the audio
        await play(audioSegments[i]);
      }

      await writer.close();
    } catch (error) {
      console.error('Error:', error);
      const errorMessage = {
        role: 'assistant',
        content: 'Error generating podcast: ' + (error as Error).message,
      };
      await writer.write(encoder.encode(`data: ${JSON.stringify(errorMessage)}\n\n`));
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
} 