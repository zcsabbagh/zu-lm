import { useEffect } from 'react';

interface PodcastTestProps {
  onTest: () => void;
  disabled?: boolean;
}

export function PodcastTest({ onTest, disabled }: PodcastTestProps) {
  useEffect(() => {
    // Add the ElevenLabs script
    const script = document.createElement('script');
    script.src = 'https://elevenlabs.io/convai-widget/index.js';
    script.async = true;
    script.type = 'text/javascript';
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleClick = () => {
    onTest();
    // Create and append the widget element
    const widget = document.createElement('elevenlabs-convai');
    widget.setAttribute('agent-id', 'xpzLkvbd6a74YQqKpu4S');
    document.getElementById('convai-container')?.appendChild(widget);
  };

  return (
    <div className="mt-8 space-y-4">
      <div className="flex justify-center">
        <button
          onClick={handleClick}
          disabled={disabled}
          className="bg-purple-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed transition-colors"
        >
          Test Me
        </button>
      </div>
      <div id="convai-container" className="flex justify-center"></div>
    </div>
  );
} 