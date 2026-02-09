import { cn } from "@/lib/utils";
import { Bitcoin, Wallet } from "lucide-react";

interface CryptoOption {
  id: string;
  name: string;
  icon: React.ReactNode;
  isDirect?: boolean;
}

const nowPaymentsOptions: CryptoOption[] = [
  {
    id: "usdttrc20",
    name: "USDT (TRC20)",
    icon: (
      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-green-500/10 flex items-center justify-center">
        <span className="text-green-500 font-bold text-base md:text-lg">₮</span>
      </div>
    ),
  },
  {
    id: "btc",
    name: "Bitcoin (BTC)",
    icon: (
      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
        <Bitcoin className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
      </div>
    ),
  },
  {
    id: "eth",
    name: "Ethereum (ETH)",
    icon: (
      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-purple-500/10 flex items-center justify-center">
        <span className="text-purple-500 font-bold text-base md:text-lg">Ξ</span>
      </div>
    ),
  },
  {
    id: "ltc",
    name: "Litecoin (LTC)",
    icon: (
      <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-muted flex items-center justify-center">
        <span className="text-muted-foreground font-bold text-base md:text-lg">Ł</span>
      </div>
    ),
  },
];

interface CryptoSelectorProps {
  selectedCrypto: string;
  onSelect: (crypto: string) => void;
  directCryptos?: string[];
  showNowPayments?: boolean;
}

const CryptoSelector = ({ 
  selectedCrypto, 
  onSelect,
  directCryptos = [],
  showNowPayments = true,
}: CryptoSelectorProps) => {
  // Build direct crypto options
  const directOptions: CryptoOption[] = directCryptos.map(crypto => {
    if (crypto === "LTC") {
      return {
        id: "ltc_direct",
        name: "Litecoin (LTC) - مباشر",
        isDirect: true,
        icon: (
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <Wallet className="w-4 h-4 md:w-5 md:h-5 text-primary" />
          </div>
        ),
      };
    }
    if (crypto === "BTC") {
      return {
        id: "btc_direct",
        name: "Bitcoin (BTC) - مباشر",
        isDirect: true,
        icon: (
          <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-orange-500/10 flex items-center justify-center">
            <Bitcoin className="w-4 h-4 md:w-5 md:h-5 text-orange-500" />
          </div>
        ),
      };
    }
    return null;
  }).filter(Boolean) as CryptoOption[];

  const allOptions = [...directOptions, ...(showNowPayments ? nowPaymentsOptions : [])];

  return (
    <div className="space-y-3 mt-6 animate-in fade-in slide-in-from-top-2 duration-300">
      <label className="text-sm font-medium text-foreground">
        اختر العملة المفضلة
      </label>
      
      {/* Direct Payment Options */}
      {directOptions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full bg-primary"></span>
            دفع مباشر (بدون وسيط)
          </p>
          <div className="grid gap-2 md:gap-3">
            {directOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => onSelect(option.id)}
                className={cn(
                  "flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border-2 transition-all duration-200",
                  "hover:border-primary/50",
                  selectedCrypto === option.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                )}
              >
                {option.icon}
                <div className="flex flex-col items-start">
                  <span className="font-medium text-sm md:text-base text-foreground">{option.name}</span>
                  <span className="text-xs text-muted-foreground">تحويل مباشر لمحفظتنا</span>
                </div>
                {selectedCrypto === option.id && (
                  <div className="mr-auto w-4 h-4 md:w-5 md:h-5 rounded-full bg-primary flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-primary-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* NOWPayments Options */}
      {showNowPayments && (
        <div className="space-y-2">
          {directOptions.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-4">
              <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground"></span>
              عبر بوابة دفع خارجية
            </p>
          )}
          <div className="grid gap-2 md:gap-3">
            {nowPaymentsOptions.map((option) => (
              <button
                key={option.id}
                onClick={() => onSelect(option.id)}
                className={cn(
                  "flex items-center gap-3 md:gap-4 p-3 md:p-4 rounded-xl border-2 transition-all duration-200",
                  "hover:border-primary/50",
                  selectedCrypto === option.id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                )}
              >
                {option.icon}
                <span className="font-medium text-sm md:text-base text-foreground">{option.name}</span>
                {selectedCrypto === option.id && (
                  <div className="mr-auto w-4 h-4 md:w-5 md:h-5 rounded-full bg-primary flex items-center justify-center">
                    <svg
                      className="w-3 h-3 text-primary-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-2">
        {selectedCrypto.endsWith("_direct") 
          ? "💰 ستحصل على عنوان محفظة للتحويل المباشر"
          : "💡 سيتم تحويلك لصفحة NOWPayments لإكمال الدفع بأمان"}
      </p>
    </div>
  );
};

export default CryptoSelector;