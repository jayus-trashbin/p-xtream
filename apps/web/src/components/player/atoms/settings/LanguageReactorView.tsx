import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { Toggle } from "@/components/buttons/Toggle";
import { Icon, Icons } from "@/components/Icon";
import { Menu } from "@/components/player/internals/ContextMenu";
import { useOverlayRouter } from "@/hooks/useOverlayRouter";
import { useSubtitleStore } from "@/stores/subtitles";
import { getPrettyLanguageNameFromLocale } from "@/utils/language";

import { VocabularyReview } from "./VocabularyReview";

export function LanguageReactorView({ id }: { id: string }) {
  const router = useOverlayRouter(id);
  const { t } = useTranslation();
  const [showVocab, setShowVocab] = useState(false);

  const enabled = useSubtitleStore((s) => s.languageReactorEnabled);
  const setEnabled = useSubtitleStore((s) => s.setLanguageReactorEnabled);
  const dualEnabled = useSubtitleStore((s) => s.dualEnabled);
  const setDualEnabled = useSubtitleStore((s) => s.setDualEnabled);
  const autoPauseOnSubtitle = useSubtitleStore((s) => s.autoPauseOnSubtitle);
  const setAutoPauseOnSubtitle = useSubtitleStore((s) => s.setAutoPauseOnSubtitle);
  const dualPosition = useSubtitleStore((s) => s.dualPosition);
  const setDualPosition = useSubtitleStore((s) => s.setDualPosition);
  const setShowWizard = useSubtitleStore((s) => s.setShowLanguageReactorWizard);
  const studyLanguage = useSubtitleStore((s) => s.studyLanguage);
  const nativeLanguage = useSubtitleStore((s) => s.nativeLanguage);

  const studyName = studyLanguage
    ? (getPrettyLanguageNameFromLocale(studyLanguage) ?? studyLanguage.toUpperCase())
    : null;
  const nativeName =
    getPrettyLanguageNameFromLocale(nativeLanguage) ?? nativeLanguage.toUpperCase();

  if (showVocab) {
    return (
      <>
        <Menu.BackLink onClick={() => setShowVocab(false)}>
          {t("languageReactor.backToSettings", "Language Reactor")}
        </Menu.BackLink>
        <Menu.Section>
          <VocabularyReview />
        </Menu.Section>
      </>
    );
  }

  return (
    <>
      <Menu.BackLink onClick={() => router.navigate("/")}>
        {t("player.menus.languageReactor.title", "Language Reactor")}
      </Menu.BackLink>

      {/* ── Modo de aprendizado ── */}
      <Menu.Section>
        <Menu.Link
          rightSide={
            <Toggle
              enabled={enabled}
              onClick={() => setEnabled(!enabled)}
            />
          }
        >
          {t("languageReactor.learningMode", "Modo de Aprendizado")}
        </Menu.Link>

        {/* Language pair row — only when configured */}
        {studyName && (
          <Menu.Link
            clickable
            onClick={() => setShowWizard(true)}
            rightSide={
              <span className="flex items-center gap-1 text-video-context-type-accent text-sm font-medium">
                <Icon icon={Icons.TRANSLATE} className="text-base" />
                {studyName}
                <Icon icon={Icons.CHEVRON_RIGHT} className="text-xs opacity-60" />
                {nativeName}
              </span>
            }
          >
            {t("languageReactor.wizard.reconfigure", "Reconfigurar")}
          </Menu.Link>
        )}
      </Menu.Section>

      {/* Setup CTA — only shown before first configuration */}
      {!studyName && (
        <Menu.Section>
          <div className="py-1">
            <Button
              theme="purple"
              className="w-full"
              onClick={() => setShowWizard(true)}
            >
              <Icon icon={Icons.WAND} className="mr-2" />
              {t("languageReactor.wizard.activate", "Configurar Language Reactor")}
            </Button>
          </div>
        </Menu.Section>
      )}

      {/* ── Legendas ── */}
      <Menu.SectionTitle>
        {t("languageReactor.subtitlesSection", "Legendas")}
      </Menu.SectionTitle>
      <Menu.Section>
        <Menu.Link
          rightSide={
            <Toggle
              enabled={dualEnabled}
              onClick={() => setDualEnabled(!dualEnabled)}
            />
          }
        >
          {t("languageReactor.dualSubs", "Legendas Duplas")}
        </Menu.Link>

        {dualEnabled && (
          <Menu.Link
            clickable
            onClick={() =>
              setDualPosition(dualPosition === "stacked" ? "split" : "stacked")
            }
            rightSide={
              <span className="text-video-context-type-accent text-sm font-medium">
                {dualPosition === "stacked"
                  ? t("languageReactor.stacked", "Empilhado")
                  : t("languageReactor.split", "Lado a lado")}
              </span>
            }
          >
            {t("languageReactor.dualPosition", "Layout")}
          </Menu.Link>
        )}

        <Menu.Link
          rightSide={
            <Toggle
              enabled={autoPauseOnSubtitle}
              onClick={() => setAutoPauseOnSubtitle(!autoPauseOnSubtitle)}
            />
          }
        >
          {t("languageReactor.autoPause", "Pausar ao clicar na palavra")}
        </Menu.Link>
      </Menu.Section>

      {/* ── Vocabulário ── */}
      <Menu.SectionTitle>
        {t("languageReactor.vocabSection", "Vocabulário")}
      </Menu.SectionTitle>
      <Menu.Section>
        <Menu.ChevronLink onClick={() => setShowVocab(true)}>
          {t("languageReactor.openVocab", "Revisar Vocabulário")}
        </Menu.ChevronLink>
      </Menu.Section>
    </>
  );
}
