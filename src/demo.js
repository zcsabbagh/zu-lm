import { playPodcastTranscript } from './voice.js';

const podcast_transcript_sample_with_two_speakers = [
  {
    speaker: "Speaker 1",
    text: "Welcome to our podcast! Today we're going to discuss the fascinating world of artificial intelligence and its impact on our daily lives."
  },
  {
    speaker: "Speaker 2", 
    text: "That's right! I'm really excited to share my thoughts on this topic. AI has been making waves across various industries."
  }
];

// Run the demo
playPodcastTranscript(podcast_transcript_sample_with_two_speakers).catch(console.error); 