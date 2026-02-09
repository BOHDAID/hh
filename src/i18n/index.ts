import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import arTranslations from './locales/ar.json';
import enTranslations from './locales/en.json';

const resources = {
  ar: {
    translation: arTranslations,
  },
  en: {
    translation: enTranslations,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'ar',
    lng: localStorage.getItem('i18nextLng') || 'ar',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

// Update document direction and language based on current language
const updateDocumentDirection = (lang: string) => {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.dir = dir;
  document.documentElement.lang = lang;
  document.body.style.direction = dir;
  document.body.style.textAlign = lang === 'ar' ? 'right' : 'left';
};

// Set initial direction
updateDocumentDirection(i18n.language);

// Listen for language changes
i18n.on('languageChanged', (lng) => {
  updateDocumentDirection(lng);
  localStorage.setItem('i18nextLng', lng);
});

export default i18n;
