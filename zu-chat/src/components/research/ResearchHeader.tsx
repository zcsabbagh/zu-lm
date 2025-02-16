import Link from 'next/link';

interface ResearchHeaderProps {
  title: string;
}

export function ResearchHeader({ title }: ResearchHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <Link
        href="/research"
        className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600"
      >
        Research New Topic
      </Link>
    </div>
  );
} 