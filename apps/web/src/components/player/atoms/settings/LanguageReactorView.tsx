import { useTranslation } from "react-i18next";
import { Button } from "@/components/buttons/Button";
import { Icon, Icons } from "@/components/Icon";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { useSubtitleStore } from "@/stores/subtitles";
import { VocabularyReview } from "./VocabularyReview";
import { useState } from "react";

export function LanguageReactorView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const { t } = useTranslation();
  
  const [showVocab, setShowVocab] = useState(false);

  const enabled = useSubtitleStore((s) => s.languageReactorEnabled);
  const setEnabled = useSubtitleStore((s) => s.setLanguageReactorEnabled);
  const dualEnabled = useSubtitleStore((s) => s.dualEnabled);
  const setDualEnabled = useSubtitleStore((s) => s.setDualEnabled);
  const highlightUnknownWords = useSubtitleStore((s) => s.highlightUnknownWords);
  const setHighlightUnknownWords = useSubtitleStore((s) => s.setHighlightUnknownWords);
  const autoPauseOnSubtitle = useSubtitleStore((s) => s.autoPauseOnSubtitle);
  const setAutoPauseOnSubtitle = useSubtitleStore((s) => s.setAutoPauseOnSubtitle);
  const dualPosition = useSubtitleStore((s) => s.dualPosition);
  const setDualPosition = useSubtitleStore((s) => s.setDualPosition);

  if (showVocab) {
    return (
      <div className="relative">
        <Menu.BackLink onClick={() => setShowVocab(false)}>
          {t("languageReactor.backToSettings", "Voltar")}
        </Menu.BackLink>
        <div className="mt-4 px-4">
          <VocabularyReview />
        </div>
      </div>
    );
  }

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>
        {t("player.menus.languageReactor.title", "Language Reactor")}
      </Menu.BackLink>
      <Menu.Section>
        <div className="pb-4 space-y-4">
          {/* Main Toggle */}
          <div className="flex items-center justify-between bg-mediaCard-hoverBackground rounded-lg p-3 border border-[#9D4EDD] border-opacity-30">
            <div className="flex items-center gap-3">
              <span className="text-xl">🎓</span>
              <div className="flex flex-col">
                <span className="text-white font-bold text-sm">
                  {t("languageReactor.learningMode", "Modo de Aprendizado")}
                </span>
                <span className="text-xs text-white/50">
                  {t("languageReactor.learningModeDesc", "Vocabulário, Dicionário Popover")}
                </span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              <div className="w-9 h-5 bg-mediaCard-hoverBackground rounded-full peer peer-checked:bg-[#9D4EDD] peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-mediaCard-hoverAccent after:border after:rounded-full after:h-4 after:w-4 after:transition-all" />
            </label>
          </div>

          <Menu.Divider />

          {/* SubSettings */}
          <div className="space-y-2">
            <Menu.Item
              onClick={() => setDualEnabled(!dualEnabled)}
              rightSide={
                <Icon
                  icon={dualEnabled ? Icons.CHECK : undefined}
                  className={dualEnabled ? "text-onboarding-best" : ""}
                />
              }
            >
              <div className="flex flex-col">
                <span>{t("languageReactor.dualSubs", "Legendas Duplas (Simultâneas)")}</span>
                <span className="text-[10px] text-white/50">
                  {t("languageReactor.dualSubsDesc", "Exibe a segunda legenda configurada")}
                </span>
              </div>
            </Menu.Item>

            {dualEnabled && (
              <Menu.Item
                onClick={() => setDualPosition(dualPosition === "stacked" ? "split" : "stacked")}
                rightSide={
                  <span className="text-xs text-[#9D4EDD] font-mono">
                    {dualPosition.toUpperCase()}
                  </span>
                }
              >
                {t("languageReactor.dualPosition", "Layout das Legendas (Esquerda/Direita ou Empilhada)")}
              </Menu.Item>
            )}

            <Menu.Item
              onClick={() => setAutoPauseOnSubtitle(!autoPauseOnSubtitle)}
              rightSide={
                <Icon
                  icon={autoPauseOnSubtitle ? Icons.CHECK : undefined}
                  className={autoPauseOnSubtitle ? "text-onboarding-best" : ""}
                />
              }
            >
              <div className="flex flex-col">
                <span>{t("languageReactor.autoPause", "Pausar ao clicar na palavra")}</span>
              </div>
            </Menu.Item>
          </div>

          <Menu.Divider />

          <Button
            theme="purple"
            className="w-full flex items-center justify-center gap-2"
            onClick={() => setShowVocab(true)}
          >
            <Icon icon={Icons.BOOKMARK} />
            {t("languageReactor.openVocab", "Revisar Meu Vocabulário")}
          </Button>

        </div>
      </Menu.Section>
    </>
  );
}
