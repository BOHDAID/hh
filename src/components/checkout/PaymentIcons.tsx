import { CreditCard, Bitcoin, Wallet } from "lucide-react";

// Large icons (legacy - kept for backward compatibility)
export const PayPalIcon = () => (
  <div className="flex items-center gap-3">
    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
      <CreditCard className="w-7 h-7 text-blue-500" />
    </div>
    <div className="w-14 h-14 rounded-2xl bg-[#003087]/10 flex items-center justify-center">
      <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#003087">
        <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.77.77 0 0 1 .757-.639h6.189c2.576 0 4.478.565 5.654 1.68 1.176 1.116 1.616 2.727 1.31 4.792-.106.718-.285 1.39-.532 2.012a7.585 7.585 0 0 1-.932 1.652 5.89 5.89 0 0 1-1.339 1.273c-.496.34-1.063.601-1.698.782-.634.18-1.336.27-2.102.27H9.963a.77.77 0 0 0-.758.639l-.692 4.356a.641.641 0 0 1-.633.54H7.076v.26z"/>
      </svg>
    </div>
  </div>
);

export const CryptoIcon = () => (
  <div className="flex items-center gap-3">
    <div className="w-14 h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center">
      <Bitcoin className="w-7 h-7 text-orange-500" />
    </div>
    <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 flex items-center justify-center">
      <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#F0B90B">
        <path d="M12 0L7.2 4.8l1.8 1.8L12 3.6l3 3L16.8 4.8 12 0zm-7.2 7.2L0 12l4.8 4.8 1.8-1.8L3.6 12l3-3L4.8 7.2zm14.4 0L17.4 9l3 3-3 3 1.8 1.8L24 12l-4.8-4.8zM12 8.4L8.4 12l3.6 3.6 3.6-3.6L12 8.4zm0 12L7.2 15.6l-1.8 1.8L12 24l6.6-6.6-1.8-1.8L12 20.4z"/>
      </svg>
    </div>
  </div>
);

export const LitecoinIcon = () => (
  <div className="flex items-center gap-3">
    <div className="w-14 h-14 rounded-2xl bg-gray-500/10 flex items-center justify-center">
      <svg viewBox="0 0 32 32" className="w-8 h-8">
        <circle cx="16" cy="16" r="16" fill="#345D9D"/>
        <path fill="#fff" d="M10.5 23.3V21l1.6-.6.9-3.5-1.6.6.4-1.5 1.6-.6 2-7.7h3.5l-1.5 5.8 1.6-.6-.4 1.5-1.6.6-.9 3.5 6.4-2.4-.5 2-9.9 3.8-.5 1.9z"/>
      </svg>
    </div>
    <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center">
      <span className="text-green-500 font-bold text-2xl">₿</span>
    </div>
  </div>
);

export const WalletIcon = () => (
  <div className="flex items-center gap-3">
    <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
      <Wallet className="w-7 h-7 text-primary" />
    </div>
  </div>
);

// Compact icons for new design
export const SmallPayPalIcon = () => (
  <div className="w-10 h-10 rounded-xl bg-[#003087]/10 flex items-center justify-center">
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#003087">
      <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944 3.72a.77.77 0 0 1 .757-.639h6.189c2.576 0 4.478.565 5.654 1.68 1.176 1.116 1.616 2.727 1.31 4.792-.106.718-.285 1.39-.532 2.012a7.585 7.585 0 0 1-.932 1.652 5.89 5.89 0 0 1-1.339 1.273c-.496.34-1.063.601-1.698.782-.634.18-1.336.27-2.102.27H9.963a.77.77 0 0 0-.758.639l-.692 4.356a.641.641 0 0 1-.633.54H7.076v.26z"/>
    </svg>
  </div>
);

export const SmallCryptoIcon = () => (
  <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
    <Bitcoin className="w-5 h-5 text-orange-500" />
  </div>
);

export const SmallWalletIcon = () => (
  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
    <Wallet className="w-5 h-5 text-primary" />
  </div>
);

export const SmallLemonIcon = () => (
  <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
    <span className="text-lg">🍋</span>
  </div>
);

export const SmallCardIcon = () => (
  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
    <CreditCard className="w-5 h-5 text-blue-500" />
  </div>
);

export const SmallCryptomusIcon = () => (
  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="#8B5CF6">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>
    </svg>
  </div>
);

export const SmallOxaPayIcon = () => (
  <div className="flex items-center gap-1">
    {/* Crypto Icon */}
    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-orange-500/10 flex items-center justify-center">
      <Bitcoin className="w-4 h-4 sm:w-5 sm:h-5 text-orange-500" />
    </div>
    {/* Card Icon */}
    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-blue-500/10 flex items-center justify-center">
      <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
    </div>
  </div>
);

export const SmallSellAuthIcon = () => (
  <div className="flex items-center gap-1">
    {/* Card Icon */}
    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-cyan-500/10 flex items-center justify-center">
      <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-500" />
    </div>
    {/* Apple Pay style icon */}
    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gray-900/10 flex items-center justify-center">
      <span className="text-xs sm:text-sm font-bold text-gray-700 dark:text-gray-300"></span>
    </div>
  </div>
);
