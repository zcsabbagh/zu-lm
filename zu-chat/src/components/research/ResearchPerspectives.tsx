interface ResearchPerspectivesProps {
  trackOne: string | null;
  trackTwo: string | null;
  selectedTrack: 'one' | 'two';
  onSelectTrack: (track: 'one' | 'two') => void;
}

export function ResearchPerspectives({
  trackOne,
  trackTwo,
  selectedTrack,
  onSelectTrack,
}: ResearchPerspectivesProps) {
  return (
    <div className="mb-6 space-y-4">
      <h2 className="text-xl font-semibold">Research Perspectives</h2>
      <div className="flex gap-4">
        <button
          onClick={() => onSelectTrack('one')}
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
          onClick={() => onSelectTrack('two')}
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
  );
} 