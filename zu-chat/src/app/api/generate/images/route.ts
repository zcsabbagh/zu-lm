import { generateImage } from '@/lib/luma';
import { PodcastTranscriptSchema } from '@/lib/schemas';

export async function POST(req: Request) {
  try {
    const { transcript } = await req.json();
    
    // Validate transcript
    const validatedTranscript = PodcastTranscriptSchema.parse(transcript);

    // Generate images for all segments in parallel
    const imagePromises = validatedTranscript.map(async (segment) => {
      try {
        console.log(`Generating image for segment:`, segment);
        const imageUrl = await generateImage(segment.text);
        return {
          speaker: segment.speaker,
          imageUrl
        };
      } catch (error) {
        console.error(`Error generating image for segment:`, error);
        return {
          speaker: segment.speaker,
          imageUrl: null,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    });

    const results = await Promise.all(imagePromises);

    return Response.json({ images: results });
  } catch (error) {
    console.error('Error in image generation:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to generate images' },
      { status: 500 }
    );
  }
} 