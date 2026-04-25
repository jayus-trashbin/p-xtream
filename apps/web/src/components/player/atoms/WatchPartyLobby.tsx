import { useTranslation } from "react-i18next";
import { Button } from "@/components/buttons/Button";
import { useWatchPartySocket } from "@/hooks/useWatchPartySocket";
import { useAuthStore } from "@/stores/auth";
import { useWatchPartyStore } from "@/stores/watchParty";

export function WatchPartyLobby() {
  const { t } = useTranslation();
  const { send } = useWatchPartySocket();
  const account = useAuthStore((s) => s.account);

  const showLobby = useWatchPartyStore((s) => s.showLobby);
  const lobbyMembers = useWatchPartyStore((s) => s.lobbyMembers);
  const isHost = useWatchPartyStore((s) => s.isHost);

  if (!showLobby) return null;

  const myId = account?.userId ?? "guest";
  const myMember = lobbyMembers.find((m) => m.userId === myId);
  const isReady = myMember?.ready ?? false;

  const allReady = lobbyMembers.length > 0 && lobbyMembers.every((m) => m.ready);

  const toggleReady = () => {
    send({
      type: "lobby:ready",
      payload: { ready: !isReady },
    });
  };

  const startParty = () => {
    if (isHost && allReady) {
      send({ type: "lobby:start" });
    }
  };

  return (
    <div className="absolute inset-0 z-[60] bg-black/80 backdrop-blur-md flex items-center justify-center">
      <div className="bg-video-context-buttons-list p-8 rounded-2xl w-full max-w-md border border-white/10 shadow-2xl">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          {t("watchParty.lobby.title", "Lobby da Party")}
        </h2>

        <div className="space-y-3 mb-8">
          {lobbyMembers.map((m) => (
            <div
              key={m.userId}
              className="flex items-center justify-between p-3 rounded-xl bg-white/5"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{m.isHost ? "👑" : "👤"}</span>
                <span className="text-white font-medium">
                  {m.nickname || m.userId.substring(0, 8)}
                </span>
                {m.userId === myId && (
                  <span className="text-xs px-2 py-0.5 bg-white/10 rounded-full text-white/70">
                    {t("watchParty.lobby.you", "Você")}
                  </span>
                )}
                {isHost && m.userId !== myId && !m.isHost && (
                  <button
                    onClick={() => {
                      send({
                        type: "host:transfer",
                        payload: { toUserId: m.userId },
                      });
                    }}
                    className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/40 transition-colors"
                  >
                    {t("watchParty.lobby.makeHost", "Tornar Host")}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${m.ready ? "bg-onboarding-best shadow-[0_0_10px_#27ae60]" : "bg-type-danger shadow-[0_0_10px_#e74c3c]"}`} />
                <span className="text-sm text-white/50">
                  {m.ready
                    ? t("watchParty.lobby.ready", "Pronto")
                    : t("watchParty.lobby.notReady", "Aguardando")}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-4">
          <Button
            theme={isReady ? "danger" : "secondary"}
            className="flex-1"
            onClick={toggleReady}
          >
            {isReady
              ? t("watchParty.lobby.unready", "Não estou pronto")
              : t("watchParty.lobby.imReady", "Estou pronto!")}
          </Button>

          {isHost && (
            <Button
              theme="purple"
              className={`flex-1 transition-opacity ${allReady ? "" : "opacity-50"}`}
              disabled={!allReady}
              onClick={startParty}
            >
              {t("watchParty.lobby.startVideo", "Iniciar Vídeo")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
