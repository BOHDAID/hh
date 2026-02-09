import { cn } from "@/lib/utils";

interface PaymentMethodCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
}

const PaymentMethodCard = ({
  title,
  description,
  icon,
  isSelected,
  onClick,
  disabled = false,
}: PaymentMethodCardProps) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "relative flex flex-col items-center justify-center p-4 md:p-8 rounded-2xl border-2 transition-all duration-300 w-full min-h-[120px] md:min-h-[200px]",
        "hover:scale-[1.02] hover:shadow-lg",
        isSelected
          ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
          : "border-border bg-card hover:border-primary/50",
        disabled && "opacity-50 cursor-not-allowed hover:scale-100"
      )}
    >
      {isSelected && (
        <div className="absolute top-3 left-3 md:top-4 md:left-4 w-5 h-5 md:w-6 md:h-6 rounded-full bg-primary flex items-center justify-center">
          <svg
            className="w-3 h-3 md:w-4 md:h-4 text-primary-foreground"
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
      <div className="mb-3 md:mb-4">{icon}</div>
      <h3 className="text-base md:text-xl font-bold text-foreground mb-1 md:mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground text-center">{description}</p>
    </button>
  );
};

export default PaymentMethodCard;
