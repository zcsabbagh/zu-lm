import React, { useMemo } from "react";
import { ReactFlow, Node, Edge, Background, Controls, MiniMap } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

interface StatusMessage {
  phase: string;
  message: string;
  timestamp: number;
  chain_of_thought?: { content: string };
  track?: string;
  perspectives?: {
    perspective_one: string;
    perspective_two: string;
    topic: string;
  };
}

interface ResearchFlowProps {
  statusHistory: StatusMessage[];
}

export function ResearchFlow({ statusHistory }: ResearchFlowProps) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const trackOneX = 100;
    const trackTwoX = 800;
    let lastTrackOneId = "";
    let lastTrackTwoId = "";

    // Track the Y positions
    let trackOneY = 200;
    let trackTwoY = 200;

    // Create a temporary div to measure content height
    const measureDiv = document.createElement("div");
    measureDiv.style.width = "500px"; // Same as node width
    measureDiv.style.position = "absolute";
    measureDiv.style.visibility = "hidden";
    measureDiv.style.padding = "10px";
    document.body.appendChild(measureDiv);

    const measureContent = (content: string) => {
      measureDiv.innerHTML = content;
      const height = measureDiv.offsetHeight;
      return height;
    };

    // First, separate statuses by track
    const trackOneStatuses: StatusMessage[] = [];
    const trackTwoStatuses: StatusMessage[] = [];
    const trackNullStatuses: StatusMessage[] = [];

    statusHistory.slice(1).forEach((status) => {
      if (status.track === "two") {
        trackTwoStatuses.push(status);
      } else if (status.track === "one") {
        trackOneStatuses.push(status);
      } else {
        trackNullStatuses.push(status);
      }
    });

    // Function to group adjacent statuses with same phase
    const groupStatuses = (statuses: StatusMessage[]): StatusMessage[][] => {
      const grouped: StatusMessage[][] = [];
      let currentGroup: StatusMessage[] = [];

      statuses.forEach((status, index) => {
        if (index === 0 || status.phase === statuses[index - 1].phase) {
          currentGroup.push(status);
        } else {
          if (currentGroup.length > 0) {
            grouped.push([...currentGroup]);
          }
          currentGroup = [status];
        }
      });
      if (currentGroup.length > 0) {
        grouped.push(currentGroup);
      }
      return grouped;
    };

    // Group each track's statuses
    const groupedTrackOne = groupStatuses(trackOneStatuses);
    const groupedTrackTwo = groupStatuses(trackTwoStatuses);
    const groupedTrackNull = groupStatuses(trackNullStatuses);

    console.log("groupedTrackNull", groupedTrackNull);

    // Create perspective node if it exists
    const firstStatus = statusHistory[0];
    if (firstStatus?.perspectives) {
      const id = "node-perspective";
      const width = 600;
      const perspectivesNode: Node = {
        id,
        type: "default",
        position: { x: 200, y: 50 },
        data: {
          label: (
            <div style={{ maxWidth: `${width}px` }}>
              <div className="font-semibold text-sm border-b border-gray-300 pb-2 font-mono backdrop-blur-sm bg-white/30">
                Research Perspectives
              </div>
              <div className="text-xs mt-2 bg-white">{firstStatus.perspectives.topic}</div>
            </div>
          ),
        },
        style: {
          //   background: "#EFF6FF",
          padding: "10px 0",
          borderRadius: "10px",
          background: "transparent",
          border: "1px solid #e0e0e0",

          width: `${width}px`,
        },
      };
      nodes.push(perspectivesNode);
      lastTrackOneId = id;
      lastTrackTwoId = id;
    }

    // Function to create nodes for a track
    const createTrackNodes = (
      groupedStatuses: StatusMessage[][],
      isTrackTwo: boolean,
      startY: number
    ) => {
      let currentY = startY;

      groupedStatuses.forEach((group, index) => {
        const id = `node-${isTrackTwo ? "two" : "one"}-${index}`;
        const status = group[0];
        const width = status.phase === "summary" || status.phase === "query" ? 600 : 300;
        const x = isTrackTwo ? trackTwoX : trackOneX;

        // Combine messages from the group
        const combinedMessage = group.map((s) => s.message).join("\n\n");
        const combinedThoughts = group
          .filter((s) => s.chain_of_thought?.content)
          .map((s) => s.chain_of_thought!.content)
          .join("\n\n");

        // Measure combined content height
        let contentHeight = measureContent(
          `<div class="font-semibold text-sm">${status.phase}</div>`
        );
        contentHeight += measureContent(
          `<div class="text-xs whitespace-pre-wrap">${combinedMessage}</div>`
        );
        if (combinedThoughts) {
          contentHeight += measureContent(
            `<div class="text-xs mt-2 whitespace-pre-wrap">${combinedThoughts}</div>`
          );
        }

        const node: Node = {
          id,
          type: "default",
          position: { x: x - width / 2, y: currentY },
          data: {
            label: (
              <div style={{ maxWidth: `${width}px` }}>
                <div className="font-semibold text-sm border-b border-gray-300 pb-2 font-mono">
                  {status.phase}
                </div>
                <div className="text-xs whitespace-pre-wrap mt-2">{combinedMessage}</div>
                {combinedThoughts && (
                  <div className="text-xs mt-2 px-4 whitespace-pre-wrap text-left">
                    {combinedThoughts}
                  </div>
                )}
              </div>
            ),
          },
          style: {
            padding: "10px 0",
            borderRadius: "10px",
            border: "1px solid #e0e0e0",
            background:
              status.phase === "error"
                ? "#FEE2E2"
                : status.phase === "complete"
                ? "#D1FAE5"
                : "#EFF6FF",
            width: `${width}px`,
          },
        };

        nodes.push(node);

        // Add edges
        const lastId = isTrackTwo ? lastTrackTwoId : lastTrackOneId;
        if (lastId) {
          // For complete nodes, connect to both tracks
          if (status.phase === "final") {
          } else {
            // Normal case - connect to previous node in same track
            edges.push({
              id: `edge-${lastId}-${id}`,
              source: lastId,
              target: id,

              animated: true,
            });
          }
        }

        // Update last node id for this track
        if (isTrackTwo) {
          console.log("lastTrackTwoId", id);
          lastTrackTwoId = id;
        } else {
          lastTrackOneId = id;
        }

        // Update Y position for next node
        currentY += contentHeight + 20; // 40px spacing between nodes
      });

      return currentY;
    };

    // Create nodes for both tracks
    trackOneY = createTrackNodes(groupedTrackOne, false, trackOneY);
    trackTwoY = createTrackNodes(groupedTrackTwo, true, trackTwoY);

    let y = Math.max(trackOneY, trackTwoY);
    groupedTrackNull.forEach((group, index) => {
      const id = `node-${group[0].phase}-${index}`;

      const width = group[0].phase === "complete" ? 1000 : 300;

      const combinedMessage = group.map((s) => s.message).join("\n\n");
      const combinedThoughts = group
        .filter((s) => s.chain_of_thought?.content)
        .map((s) => s.chain_of_thought!.content)
        .join("\n\n");

      const node: Node = {
        id,
        type: "default",
        position: { x: 400 - width / 2, y },
        data: {
          label: (
            <div style={{ maxWidth: `${width}px` }}>
              <div className="font-semibold text-sm">{group[0].phase}</div>
              <div className="text-xs whitespace-pre-wrap text-left">{combinedMessage}</div>
              {combinedThoughts && (
                <div className="text-xs mt-2 whitespace-pre-wrap text-left">{combinedThoughts}</div>
              )}
            </div>
          ),
        },
        style: {
          background:
            group[0].phase === "error"
              ? "#FEE2E2"
              : group[0].phase === "complete"
              ? "#D1FAE5"
              : "#EFF6FF",
          width: `${width}px`,
        },
      };

      nodes.push(node);

      y += 100;

      console.log("final node", id);
      console.log("lastTrackOneId", lastTrackOneId);
      console.log("lastTrackTwoId", lastTrackTwoId);
      if (group[0].phase === "final") {
        if (lastTrackOneId && lastTrackOneId !== id) {
          edges.push({
            id: `edge-${lastTrackOneId}-${id}`,
            source: lastTrackOneId,
            target: id,
            type: "",
            animated: true,
          });
        }
        if (group[0].message == "Starting final summary compilation...") {
          if (lastTrackTwoId && lastTrackTwoId !== id) {
            edges.push({
              id: `edge-${lastTrackTwoId}-${id}`,
              source: lastTrackTwoId,
              target: id,
              type: "",
              animated: true,
            });
          }
        }
        lastTrackOneId = id;
        lastTrackTwoId = id;
      } else if (group[0].phase == "complete") {
        if (lastTrackOneId && lastTrackOneId !== id) {
          edges.push({
            id: `edge-${lastTrackOneId}-${id}`,
            source: lastTrackOneId,
            target: id,
            type: "",
            animated: true,
          });
        }
      }
    });

    // Clean up the measurement div
    document.body.removeChild(measureDiv);

    return { nodes, edges };
  }, [statusHistory]);

  return (
    <div style={{ height: "80vh", minHeight: "600px" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        fitViewOptions={{
          padding: 0.2,
          minZoom: 0.1,
          maxZoom: 1.5,
        }}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
