import { useState, useEffect, useRef } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface EnrichmentPopupProps {
  selectedText: string;
  onClose: () => void;
}

export function EnrichmentPopup({ selectedText, onClose }: EnrichmentPopupProps) {
  const [enrichedContent, setEnrichedContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const enrichText = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/enrich', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: selectedText }),
      });

      if (!response.ok) {
        throw new Error('Failed to enrich text');
      }

      const data = await response.json();
      setEnrichedContent(data.enrichedContent);
      setMessages([{ role: 'assistant', content: data.enrichedContent }]);
    } catch (error) {
      console.error('Error enriching text:', error);
      setEnrichedContent('Failed to enrich text. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    const userMessage = newMessage.trim();
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setNewMessage('');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: userMessage }],
          selectedText,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    }
  };

  return (
    <div className="fixed right-0 top-0 h-screen w-[600px] bg-zinc-900 text-white shadow-xl flex flex-col z-50">
      {/* Header */}
      <div className="flex justify-between items-center p-6 border-b border-zinc-700">
        <h3 className="text-xl font-semibold">Additional Context</h3>
        <button
          onClick={onClose}
          className="text-zinc-400 hover:text-white transition-colors p-2 hover:bg-zinc-800 rounded-full"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Selected Text */}
        <div className="bg-zinc-800 p-4 rounded-lg">
          <h4 className="text-sm font-medium text-zinc-400 mb-2">Selected Text</h4>
          <p className="text-zinc-200">{selectedText}</p>
        </div>

        {/* Enrich Button (only show if no messages yet) */}
        {messages.length === 0 && (
          <div className="flex justify-center">
            <button
              onClick={enrichText}
              disabled={isLoading}
              className="px-6 py-3 bg-blue-500 text-white rounded-md shadow-lg hover:bg-blue-600 transition-colors disabled:bg-blue-400"
            >
              {isLoading ? 'Enriching...' : 'Enrich'}
            </button>
          </div>
        )}

        {/* Chat Messages */}
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg ${
                message.role === 'assistant' ? 'bg-zinc-800' : 'bg-blue-600'
              }`}
            >
              <p className="text-zinc-200">{message.content}</p>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Chat Input */}
      {messages.length > 0 && (
        <div className="p-6 border-t border-zinc-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask for more context..."
              className="flex-1 px-4 py-2 bg-zinc-800 text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleSendMessage}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
} 