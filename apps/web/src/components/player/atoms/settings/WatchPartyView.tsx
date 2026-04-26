/* eslint-disable no-alert */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { getRoomStatuses } from "@/backend/player/status";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { Spinner } from "@/components/layout/Spinner";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useBackendUrl } from "@/hooks/auth/useBackendUrl";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { useWatchPartySync } from "@/hooks/useWatchPartySync";
import { useAuthStore } from "@/stores/auth";
import { getProgressPercentage } from "@/stores/progress";
import { useWatchPartyStore } from "@/stores/watchParty";

import { useDownloadLink } from "./Downloads";

export function WatchPartyView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const { t } = useTranslation();
  const downloadUrl = useDownloadLink();
  const [joinCode, setJoinCode] = useState("");
  const [showJoinInput, setShowJoinInput] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [editingCode, setEditingCode] = useState(false);
  const [customCode, setCustomCode] = useState("");
  const [hasCopiedShare, setHasCopiedShare] = useState(false);
  const backendUrl = useBackendUrl();
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const account = useAuthStore((s) => s.account);

  const getDisplayName = (userId: string) => {
    if (account?.userId === userId && account?.nickname) return account.nickname;
    return `${userId.substring(0, 8)}…`;
  };

  // Show native watch party whenever a backend URL is configured
  const hasBackend = !!backendUrl;

  const {
    enabled,
    roomCode,
    isHost,
    enableAsHost,
    enableAsGuest,
    updateRoomCode,
    disable,
    showStatusOverlay,
    setShowStatusOverlay,
  } = useWatchPartyStore();

  const { roomUsers } = useWatchPartySync();

  useEffect(() => {
    if (!enabled || isHost || roomUsers.length > 1) return;
    const timer = setTimeout(() => {
      if (roomUsers.length <= 1) enableAsHost();
    }, 10000);
    return () => clearTimeout(timer);
  }, [enabled, isHost, roomUsers.length, enableAsHost]);

  useEffect(() => {
    window.addEventListener("watchparty:validation", () => setIsJoining(false));
    return () => window.removeEventListener("watchparty:validation", () => setIsJoining(false));
  }, []);

  useEffect(() => {
    if (!enabled) setIsJoining(false);
  }, [enabled]);

  const handleLegacyClick = () => {
    if (downloadUrl) {
      window.open(
        `https://www.watchparty.me/create?video=${encodeURIComponent(downloadUrl)}`,
      );
    }
  };

  const handleHostParty = () => {
    enableAsHost();
    setShowJoinInput(false);
  };

  const handleJoinParty = async () => {
    if (joinCode.length === 0) return;
    setIsValidating(true);
    setValidationError(null);
    try {
      const response = await getRoomStatuses(backendUrl, account, joinCode);
      if (Object.keys(response.users).length === 0) {
        setValidationError(t("watchParty.emptyRoom"));
        return;
      }
      setIsJoining(true);
      enableAsGuest(joinCode);
      setShowJoinInput(false);
    } catch {
      setValidationError(t("watchParty.invalidRoom"));
    } finally {
      setIsValidating(false);
    }
  };

  const handleDisableParty = () => {
    disable();
    setShowJoinInput(false);
    setJoinCode("");
  };

  const handleCopyCode = () => {
    if (!roomCode) return;
    const url = new URL(window.location.href);
    url.searchParams.set("watchparty", roomCode);
    navigator.clipboard.writeText(url.toString());
    setHasCopiedShare(true);
    setTimeout(() => setHasCopiedShare(false), 2000);
  };

  const handleEditCode = () => {
    if (isHost && roomCode) {
      setCustomCode(roomCode);
      setEditingCode(true);
    }
  };

  const handleSaveCode = () => {
    if (customCode.length === 0) return;
    updateRoomCode(customCode);
    if (roomCode) {
      const url = new URL(window.location.href);
      url.searchParams.set("watchparty", customCode);
      window.history.replaceState({}, "", url.toString());
    }
    setEditingCode(false);
  };

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>
        {t("player.menus.watchparty.watchpartyItem")}
      </Menu.BackLink>

      <Menu.Section>
        <div className="pb-3 space-y-3">

          {/* ─── No backend configured ─── */}
          {!hasBackend && (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Icon icon={Icons.CLAPPER_BOARD} className="text-type-secondary" />
                <p className="text-sm font-medium text-white">
                  {t("watchParty.nativeTitle", "Watch Party Nativa")}
                </p>
              </div>
              <p className="text-xs text-type-secondary leading-relaxed">
                {t("watchParty.noBackend", "Configure um servidor (backend) nas configurações para usar a Watch Party nativa com sincronização em tempo real.")}
              </p>
            </div>
          )}

          {/* ─── Native Watch Party (backend configured) ─── */}
          {hasBackend && (
            enabled ? (
              <div className="space-y-3">
                {isJoining ? (
                  <div className="flex flex-col items-center gap-2 py-6">
                    <Spinner className="w-6 h-6" />
                    <p className="text-sm text-type-secondary">
                      {t("watchParty.validating")}
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Status badge */}
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <p className="text-xs text-type-secondary">
                        {isHost
                          ? t("watchParty.isHostShort", "Você é o anfitrião")
                          : t("watchParty.isGuestShort", "Conectado como convidado")}
                      </p>
                    </div>

                    {/* Room code card */}
                    <div
                      className="relative rounded-xl border border-white/[0.1] bg-white/[0.04] cursor-pointer group transition-all duration-200 hover:border-white/20 hover:bg-white/[0.07] overflow-hidden"
                      onClick={editingCode ? undefined : handleCopyCode}
                    >
                      {/* Subtle accent line */}
                      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-buttons-purpleHover/40 to-transparent" />

                      <div className="px-4 py-4">
                        {isHost && !editingCode && (
                          <button
                            type="button"
                            className="absolute top-3 right-3 w-6 h-6 flex items-center justify-center rounded-lg text-type-secondary hover:text-white hover:bg-white/10 transition-all duration-150 cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); handleEditCode(); }}
                          >
                            <Icon icon={Icons.EDIT} className="text-xs" />
                          </button>
                        )}

                        {editingCode ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={customCode}
                              maxLength={10}
                              className="bg-transparent border-none text-center font-mono tracking-widest flex-1 outline-none text-type-logo text-2xl uppercase"
                              onChange={(e) => setCustomCode(e.target.value.toUpperCase())}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                            />
                            <Button
                              theme="purple"
                              padding="px-3 py-1.5"
                              onClick={(e) => { e.stopPropagation(); handleSaveCode(); }}
                            >
                              {t("watchParty.save", "Salvar")}
                            </Button>
                          </div>
                        ) : (
                          <div className="text-center">
                            <p className="font-mono tracking-[0.3em] text-2xl font-bold text-white select-all">
                              {hasCopiedShare ? t("watchParty.linkCopied", "Link copiado!") : roomCode}
                            </p>
                          </div>
                        )}
                      </div>

                      {!editingCode && (
                        <div className="px-4 pb-3 flex items-center justify-center gap-1.5 text-xs text-type-secondary group-hover:text-white/60 transition-colors">
                          <Icon icon={hasCopiedShare ? Icons.CHECKMARK : Icons.COPY} className="text-xs" />
                          <span>
                            {isHost
                              ? t("watchParty.clickToCopyLink", "Clique para copiar o link de convite")
                              : t("watchParty.connectedAsGuest", "Conectado como convidado")}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Viewers */}
                    {roomUsers.length > 1 && (
                      <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Icon icon={Icons.USER} className="text-xs text-type-secondary" />
                          <span className="text-xs font-medium text-white">
                            {t("watchParty.viewers", { count: roomUsers.length })}
                          </span>
                        </div>
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {roomUsers.map((user) => (
                            <div
                              key={user.userId}
                              className="flex items-center justify-between py-1 px-1"
                            >
                              <span className="flex items-center gap-2 text-xs">
                                <Icon
                                  icon={user.isHost ? Icons.RISING_STAR : Icons.USER}
                                  className={`text-xs ${user.isHost ? "text-onboarding-best" : "text-type-secondary"}`}
                                />
                                <span className={user.isHost ? "text-onboarding-best font-medium" : "text-type-secondary"}>
                                  {getDisplayName(user.userId)}
                                </span>
                              </span>
                              <span className="text-xs text-type-secondary tabular-nums">
                                {user.player.duration > 0
                                  ? `${Math.floor(getProgressPercentage(user.player.time, user.player.duration))}%`
                                  : `${Math.floor(user.player.time)}s`}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Status overlay toggle */}
                    <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
                      <span className="text-sm text-white">
                        {t("watchParty.showStatusOverlay", "Barra de status")}
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={showStatusOverlay}
                          onChange={() => setShowStatusOverlay(!showStatusOverlay)}
                        />
                        <div className="w-9 h-5 bg-white/10 rounded-full peer peer-checked:bg-buttons-purple peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border after:border-white/20 after:rounded-full after:h-4 after:w-4 after:transition-all" />
                      </label>
                    </div>

                    {/* Leave */}
                    <Button className="w-full" theme="danger" onClick={handleDisableParty}>
                      {t("watchParty.leaveWatchParty", "Sair da sessão")}
                    </Button>
                  </>
                )}
              </div>
            ) : (
              /* ─── Not yet joined ─── */
              <div className="space-y-3">
                {showJoinInput ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      maxLength={10}
                      className="w-full py-3 px-4 text-center text-2xl tracking-[0.25em] font-mono font-bold bg-white/[0.05] border border-white/[0.1] focus:border-buttons-purpleHover/60 rounded-xl text-type-logo outline-none transition-colors duration-200 uppercase placeholder:text-white/20"
                      placeholder="ABC123"
                      value={joinCode}
                      onChange={(e) => {
                        setJoinCode(e.target.value.toUpperCase());
                        setValidationError(null);
                      }}
                    />
                    {validationError && (
                      <p className="text-xs text-center text-red-400">{validationError}</p>
                    )}
                    {isValidating && (
                      <div className="flex items-center justify-center gap-2 text-sm text-type-secondary">
                        <Spinner className="w-4 h-4" />
                        {t("watchParty.validating")}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        theme="secondary"
                        onClick={() => { setShowJoinInput(false); setValidationError(null); }}
                      >
                        {t("watchParty.cancel", "Cancelar")}
                      </Button>
                      <Button
                        className="flex-1"
                        theme="purple"
                        onClick={handleJoinParty}
                        disabled={joinCode.length === 0 || isValidating}
                      >
                        {t("watchParty.join", "Entrar")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <Button className="w-full" theme="purple" onClick={handleHostParty}>
                      <Icon icon={Icons.RISING_STAR} className="mr-2 text-sm" />
                      {t("watchParty.hostParty", "Criar sessão")}
                    </Button>
                    <Button className="w-full" theme="secondary" onClick={() => setShowJoinInput(true)}>
                      <Icon icon={Icons.USER} className="mr-2 text-sm" />
                      {t("watchParty.joinParty", "Entrar com código")}
                    </Button>
                  </>
                )}
              </div>
            )
          )}

          <Menu.Divider />

          {/* ─── Legacy fallback ─── */}
          <Menu.Link
            clickable
            onClick={handleLegacyClick}
            rightSide={<Icon className="text-xl" icon={Icons.WATCH_PARTY} />}
          >
            {t("player.menus.watchparty.legacyWatchparty")}
          </Menu.Link>
          <Menu.Paragraph marginClass="text-xs text-type-secondary mt-1">
            {t("player.menus.watchparty.notice")}
          </Menu.Paragraph>
        </div>
      </Menu.Section>
    </>
  );
}
