import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface ResearchPerspectivesProps {
  trackOne: string | null;
  trackTwo: string | null;
  selectedTrack: "one" | "two";
  onSelectTrack: (track: "one" | "two") => void;
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

      <Tabs value={selectedTrack} onValueChange={onSelectTrack}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="one" disabled={!trackOne}>
            Perspective One
          </TabsTrigger>
          <TabsTrigger value="two" disabled={!trackTwo}>
            Perspective Two
          </TabsTrigger>
        </TabsList>

        <TabsContent value="one">
          <div className="prose max-w-none">{trackOne}</div>
        </TabsContent>

        <TabsContent value="two">
          <div className="prose max-w-none">{trackTwo}</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
