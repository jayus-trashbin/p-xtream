import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";

import { Icon, Icons } from "@/components/Icon";
import { WideContainer } from "@/components/layout/WideContainer";
import { VocabularyReview } from "@/components/player/atoms/settings/VocabularyReview";
import { SubPageLayout } from "@/pages/layouts/SubPageLayout";

export function VocabularyPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <SubPageLayout>
      <WideContainer>
        <div className="py-10 space-y-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="text-type-secondary hover:text-white transition-colors tabbable rounded-full p-1"
            >
              <Icon icon={Icons.ARROW_LEFT} className="text-xl" />
            </button>
            <h1 className="text-3xl font-bold text-white">
              {t("languageReactor.vocabularyTitle", "Meu Vocabulário")}
            </h1>
          </div>
          <VocabularyReview />
        </div>
      </WideContainer>
    </SubPageLayout>
  );
}
