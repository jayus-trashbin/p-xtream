import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/buttons/Button";
import { FlagIcon } from "@/components/FlagIcon";
import { Icon, Icons } from "@/components/Icon";
import { useLanguageStore } from "@/stores/language";
import { usePlayerStore } from "@/stores/player/store";
import { useSubtitleStore } from "@/stores/subtitles";
import { getPrettyLanguageNameFromLocale } from "@/utils/language";

const STUDY_LANGUAGES = [
  "en", "es", "pt-BR", "fr", "de", "it", "ja", "ko", "zh",
  "ru", "ar", "nl", "pl", "tr", "hi", "sv", "uk", "cs", "he", "ro",
];

const NATIVE_LANGUAGES = [
  "pt-BR", "en", "es", "fr", "de", "it", "ja", "ko", "zh",
  "ru", "ar", "nl", "pl", "tr", "hi", "sv", "uk", "cs", "he", "ro",
];

interface LanguageOption {
  code: string;
  name: string;
}

function LanguageGrid({
  languages,
  selected,
  onSelect,
  exclude,
}: {
  languages: LanguageOption[];
  selected: string | null;
  onSelect: (code: string) => void;
  exclude?: string | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
      {languages
        .filter((l) => l.code !== exclude)
        .map((lang) => (
          <button
            key={lang.code}
            type="button"
            onClick={() => onSelect(lang.code)}
            className={[
              "flex items-center gap-2.5 px-3 py-3 rounded-xl border transition-all duration-200 text-left cursor-pointer select-none",
              selected === lang.code
                ? "border-buttons-purpleHover bg-buttons-purpleHover/20 text-white ring-1 ring-buttons-purpleHover/50"
                : "border-white/10 bg-white/[0.03] text-type-secondary hover:border-white/25 hover:text-white hover:bg-white/[0.07]",
            ].join(" ")}
          >
            <span className="shrink-0 w-6 h-6 flex items-center justify-center">
              <FlagIcon langCode={lang.code} />
            </span>
            <span className="text-sm font-medium truncate">{lang.name}</span>
            {selected === lang.code && (
              <Icon icon={Icons.CHECKMARK} className="ml-auto text-xs text-buttons-purpleHover shrink-0" />
            )}
          </button>
        ))}
    </div>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={[
            "rounded-full transition-all duration-300",
            i === current
              ? "w-4 h-1.5 bg-buttons-purpleHover"
              : i < current
                ? "w-1.5 h-1.5 bg-white/40"
                : "w-1.5 h-1.5 bg-white/15",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

export function LanguageReactorWizard() {
  const { t } = useTranslation();
  const appLanguage = useLanguageStore((s) => s.language);

  const showWizard = useSubtitleStore((s) => s.showLanguageReactorWizard);
  const setShowWizard = useSubtitleStore((s) => s.setShowLanguageReactorWizard);
  const setStudyLanguage = useSubtitleStore((s) => s.setStudyLanguage);
  const setNativeLanguage = useSubtitleStore((s) => s.setNativeLanguage);
  const setLanguageReactorEnabled = useSubtitleStore((s) => s.setLanguageReactorEnabled);
  const setLanguageReactorOnboarded = useSubtitleStore((s) => s.setLanguageReactorOnboarded);
  const setDualEnabled = useSubtitleStore((s) => s.setDualEnabled);

  const captionList = usePlayerStore((s) => s.captionList);
  const loadSecondaryFromTranslation = usePlayerStore((s) => s.loadSecondaryFromTranslation);
  const selectedCaption = usePlayerStore((s) => s.caption.selected);

  const [step, setStep] = useState<0 | 1>(0);
  const [studyLang, setStudyLang] = useState<string | null>(null);
  const [nativeLang, setNativeLang] = useState<string>(appLanguage || "pt-BR");
  const [isActivating, setIsActivating] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (showWizard) {
      setStep(0);
      setStudyLang(null);
      setNativeLang(appLanguage || "pt-BR");
      setIsActivating(false);
      setIsDone(false);
    }
    return () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    };
  }, [showWizard, appLanguage]);

  const studyOptions: LanguageOption[] = STUDY_LANGUAGES.map((code) => ({
    code,
    name: getPrettyLanguageNameFromLocale(code) ?? code,
  }));

  const nativeOptions: LanguageOption[] = NATIVE_LANGUAGES.map((code) => ({
    code,
    name: getPrettyLanguageNameFromLocale(code) ?? code,
  }));

  async function handleActivate() {
    if (!studyLang) return;
    setIsActivating(true);

    setStudyLanguage(studyLang);
    setNativeLanguage(nativeLang);
    setLanguageReactorEnabled(true);
    setDualEnabled(true);

    try {
      const studyCaption =
        captionList.find(
          (c) =>
            c.language === studyLang ||
            c.language.startsWith(`${studyLang}-`) ||
            studyLang.startsWith(`${c.language}-`),
        ) ??
        captionList.find((c) => c.id === selectedCaption?.id) ??
        captionList[0];

      if (studyCaption) {
        await loadSecondaryFromTranslation(studyCaption, nativeLang);
      }
    } catch {
      // Non-fatal: LR enabled, secondary subtitle just won't load
    }

    setLanguageReactorOnboarded(true);
    setIsActivating(false);
    setIsDone(true);
    closeTimerRef.current = setTimeout(() => {
      setShowWizard(false);
    }, 2000);
  }

  function handleClose() {
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setShowWizard(false);
  }

  if (!showWizard) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="relative w-full max-w-md flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(145deg, rgba(30,20,50,0.98), rgba(15,10,30,0.99))",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 25px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(157,78,221,0.15)",
          maxHeight: "90vh",
        }}
      >
        {/* Purple glow accent */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(157,78,221,0.6), transparent)" }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, rgba(157,78,221,0.3), rgba(120,50,180,0.2))", border: "1px solid rgba(157,78,221,0.3)" }}
            >
              <Icon icon={Icons.TRANSLATE} className="text-base text-purple-300" />
            </div>
            <div>
              <p className="font-semibold text-white text-sm leading-tight">
                {t("languageReactor.wizard.title", "Language Reactor")}
              </p>
              <div className="mt-1">
                <StepDots current={isDone ? 2 : step} total={2} />
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-type-secondary hover:text-white hover:bg-white/10 transition-all duration-150 cursor-pointer"
          >
            <Icon icon={Icons.X} className="text-sm" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 min-h-0">
          {/* Step 0: Study language */}
          {!isDone && step === 0 && (
            <div className="space-y-3">
              <div>
                <p className="text-white font-semibold text-base">
                  {t("languageReactor.wizard.studyQuestion", "Qual idioma você quer aprender?")}
                </p>
                <p className="text-type-secondary text-sm mt-1">
                  {t("languageReactor.wizard.studyHint", "As legendas do conteúdo aparecerão neste idioma.")}
                </p>
              </div>
              <LanguageGrid
                languages={studyOptions}
                selected={studyLang}
                onSelect={setStudyLang}
              />
            </div>
          )}

          {/* Step 1: Native language */}
          {!isDone && step === 1 && (
            <div className="space-y-3">
              <div>
                <p className="text-white font-semibold text-base">
                  {t("languageReactor.wizard.nativeQuestion", "Qual é o seu idioma nativo?")}
                </p>
                <p className="text-type-secondary text-sm mt-1">
                  {t("languageReactor.wizard.nativeHint", "Traduções e legenda secundária aparecerão neste idioma.")}
                </p>
              </div>
              <LanguageGrid
                languages={nativeOptions}
                selected={nativeLang}
                onSelect={setNativeLang}
                exclude={studyLang}
              />
            </div>
          )}

          {/* Activating / Done state */}
          {(isActivating || isDone) && (
            <div className="flex flex-col items-center justify-center py-8 gap-4 text-center">
              {isDone ? (
                <>
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(16,185,129,0.15))", border: "1px solid rgba(34,197,94,0.3)" }}
                  >
                    <Icon icon={Icons.CHECKMARK} className="text-2xl text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-white font-bold text-lg">
                      {t("languageReactor.wizard.done", "Ativado!")}
                    </p>
                    <p className="text-type-secondary text-sm mt-1 max-w-xs mx-auto">
                      {t("languageReactor.wizard.doneDesc", "Clique nas palavras das legendas para ver definições e salvar no vocabulário.")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-type-secondary">
                    <FlagIcon langCode={studyLang ?? ""} />
                    <span className="font-medium text-white">{getPrettyLanguageNameFromLocale(studyLang ?? "") ?? studyLang}</span>
                    <Icon icon={Icons.CHEVRON_RIGHT} className="text-xs" />
                    <FlagIcon langCode={nativeLang} />
                    <span className="font-medium text-white">{getPrettyLanguageNameFromLocale(nativeLang) ?? nativeLang}</span>
                  </div>
                </>
              ) : (
                <>
                  <div
                    className="w-10 h-10 rounded-full border-2 border-t-transparent animate-spin"
                    style={{ borderColor: "rgba(157,78,221,0.4)", borderTopColor: "transparent" }}
                    // override for top color
                  />
                  <p className="text-type-secondary text-sm">
                    {t("languageReactor.wizard.loading", "Configurando legendas...")}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isActivating && !isDone && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.07] shrink-0 gap-3">
            {step === 0 ? (
              <>
                <Button theme="secondary" onClick={handleClose} padding="md:px-4 p-2">
                  {t("languageReactor.wizard.cancel", "Cancelar")}
                </Button>
                <Button
                  theme="purple"
                  disabled={!studyLang}
                  onClick={() => setStep(1)}
                  padding="md:px-4 p-2"
                >
                  {t("languageReactor.wizard.next", "Próximo")}
                  <Icon icon={Icons.CHEVRON_RIGHT} className="ml-1.5 text-sm" />
                </Button>
              </>
            ) : (
              <>
                <Button theme="secondary" onClick={() => setStep(0)} padding="md:px-4 p-2">
                  <Icon icon={Icons.CHEVRON_LEFT} className="mr-1.5 text-sm" />
                  {t("languageReactor.wizard.back", "Voltar")}
                </Button>
                <Button theme="purple" onClick={handleActivate} padding="md:px-4 p-2">
                  <Icon icon={Icons.WAND} className="mr-1.5 text-sm" />
                  {t("languageReactor.wizard.activate", "Ativar")}
                </Button>
              </>
            )}
          </div>
        )}

        {isDone && (
          <div className="px-5 py-4 border-t border-white/[0.07] shrink-0">
            <Button theme="purple" className="w-full" onClick={handleClose} padding="py-2.5">
              {t("languageReactor.wizard.close", "Começar a assistir")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
