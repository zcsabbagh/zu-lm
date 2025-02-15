import axios from 'axios';
import dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

const ELEVENLABS_API_KEY = ""

async function generateSpeech(text: string): Promise<void> {
  try {
    const response = await axios({
      method: 'post',
      url: 'https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', // Rachel voice
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        text,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.5,
        },
      },
      responseType: 'arraybuffer',
    });

    // Save the audio file
    fs.writeFileSync('output.mp3', response.data);
    console.log('Speech generated successfully! Check output.mp3');
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error('Error generating speech:', error.response?.data || error.message);
    } else {
      console.error('Error generating speech:', error);
    }
  }
}

// Test the function
generateSpeech('Hello! This is a test of the ElevenLabs API using TypeScript.'); 