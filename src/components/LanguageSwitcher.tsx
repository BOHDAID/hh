import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Globe } from 'lucide-react';

const LanguageSwitcher = () => {
  const { i18n, t } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const currentLanguage = i18n.language;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9">
          <Globe className="h-4 w-4" />
          <span className="sr-only">{t('common.language')}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        <DropdownMenuItem
          onClick={() => changeLanguage('ar')}
          className={`flex items-center gap-2 cursor-pointer ${
            currentLanguage === 'ar' ? 'bg-primary/10 text-primary' : ''
          }`}
        >
          <span className="text-lg">🇸🇦</span>
          <span>{t('common.arabic')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => changeLanguage('en')}
          className={`flex items-center gap-2 cursor-pointer ${
            currentLanguage === 'en' ? 'bg-primary/10 text-primary' : ''
          }`}
        >
          <span className="text-lg">🇺🇸</span>
          <span>{t('common.english')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
