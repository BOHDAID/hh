import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface CompactPaymentOptionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  isSelected: boolean;
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  actionButton?: {
    label: string;
    onClick: () => void;
  };
}

const CompactPaymentOption = ({
  title,
  description,
  icon,
  isSelected,
  onClick,
  disabled = false,
  disabledReason,
  actionButton,
}: CompactPaymentOptionProps) => {
  return (
    <div
      onClick={() => !disabled && onClick()}
      className={cn(
        "relative flex items-center gap-2 sm:gap-4 p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 transition-all duration-200 cursor-pointer",
        "hover:shadow-sm",
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border bg-card hover:border-primary/50",
        disabled && "opacity-60 cursor-not-allowed hover:border-border hover:shadow-none"
      )}
    >
      {/* Radio Indicator */}
      <div
        className={cn(
          "w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors",
          isSelected
            ? "border-primary bg-primary"
            : "border-muted-foreground/40"
        )}
      >
        {isSelected && (
          <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary-foreground" />
        )}
      </div>

      {/* Icon */}
      <div className="flex-shrink-0 scale-90 sm:scale-100">{icon}</div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 sm:gap-2">
          <h3 className="font-semibold text-foreground truncate text-sm sm:text-base">{title}</h3>
          {disabled && disabledReason && (
            <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 text-amber-500 flex-shrink-0" />
          )}
        </div>
        <p className={cn(
          "text-xs sm:text-sm truncate",
          disabled ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
        )}>
          {disabled && disabledReason ? disabledReason : description}
        </p>
      </div>

      {/* Action Button */}
      {actionButton && (
        <Button
          variant="outline"
          size="sm"
          className="flex-shrink-0 text-[10px] sm:text-xs px-2 sm:px-3 h-7 sm:h-8"
          onClick={(e) => {
            e.stopPropagation();
            actionButton.onClick();
          }}
        >
          {actionButton.label}
        </Button>
      )}
    </div>
  );
};

export default CompactPaymentOption;
