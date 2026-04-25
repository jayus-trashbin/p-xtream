import { useEffect, useState } from "react";
import { useWatchPartyStore } from "@/stores/watchParty";

export function WatchPartyReactions() {
  const reactionsQueue = useWatchPartyStore((s) => s.reactionsQueue);
  const dequeueReaction = useWatchPartyStore((s) => s.dequeueReaction);
  
  const [activeReactions, setActiveReactions] = useState<
    { id: string; emoji: string; left: string }[]
  >([]);

  useEffect(() => {
    if (reactionsQueue.length > 0) {
      // Take the first reaction and float it up
      const reaction = reactionsQueue[0];
      dequeueReaction(reaction.id);

      setActiveReactions((prev) => [
        ...prev,
        {
          id: reaction.id,
          emoji: reaction.emoji,
          // Random horizontal position near the bottom right (chat toggle area)
          left: `${Math.random() * 40 - 20}px`,
        },
      ]);
      
      // Remove it after the animation completes (2s)
      setTimeout(() => {
        setActiveReactions((current) =>
          current.filter((r) => r.id !== reaction.id),
        );
      }, 2000);
    }
  }, [reactionsQueue, dequeueReaction]);

  if (activeReactions.length === 0) return null;

  return (
    <div className="absolute right-8 bottom-[100px] pointer-events-none z-50">
      <style>
        {`
          @keyframes floatReaction {
            0% {
              transform: translateY(0) scale(0.5);
              opacity: 0;
            }
            15% {
              transform: translateY(-20px) scale(1.2);
              opacity: 1;
            }
            100% {
              transform: translateY(-120px) scale(1);
              opacity: 0;
            }
          }
        `}
      </style>
      <div className="relative">
        {activeReactions.map((r) => (
          <div
            key={r.id}
            className="absolute text-4xl"
            style={{
              left: r.left,
              bottom: 0,
              animation: "floatReaction 2s ease-out forwards",
            }}
          >
            {r.emoji}
          </div>
        ))}
      </div>
    </div>
  );
}
