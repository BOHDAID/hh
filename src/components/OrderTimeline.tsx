import { motion } from "framer-motion";
import { Package, CreditCard, Loader2, CheckCircle2, Shield, ShieldOff } from "lucide-react";

interface OrderTimelineProps {
  status: string;
  paymentStatus: string;
  warrantyExpiresAt: string | null;
  createdAt: string;
}

const OrderTimeline = ({ status, paymentStatus, warrantyExpiresAt, createdAt }: OrderTimelineProps) => {
  const now = new Date();
  const warrantyExpired = warrantyExpiresAt ? new Date(warrantyExpiresAt) < now : false;

  const steps = [
    {
      id: "placed",
      label: "تم الطلب",
      icon: Package,
      completed: true,
      date: createdAt,
    },
    {
      id: "paid",
      label: "تم الدفع",
      icon: CreditCard,
      completed: paymentStatus === "paid" || status === "completed",
      active: paymentStatus === "pending" && status === "pending",
    },
    {
      id: "processing",
      label: "جاري المعالجة",
      icon: Loader2,
      completed: status === "completed",
      active: status === "processing",
    },
    {
      id: "delivered",
      label: "تم التسليم",
      icon: CheckCircle2,
      completed: status === "completed",
    },
    ...(warrantyExpiresAt
      ? [
          {
            id: "warranty",
            label: warrantyExpired ? "انتهى الضمان" : "الضمان نشط",
            icon: warrantyExpired ? ShieldOff : Shield,
            completed: warrantyExpired,
            active: !warrantyExpired && status === "completed",
          },
        ]
      : []),
  ];

  return (
    <div className="py-4 px-2">
      <div className="flex items-center justify-between relative">
        {/* Background line */}
        <div className="absolute top-5 right-5 left-5 h-0.5 bg-muted z-0" />
        
        {/* Progress line */}
        {(() => {
          const lastCompletedIdx = steps.reduce((acc, s, i) => (s.completed ? i : acc), -1);
          const activeIdx = steps.findIndex(s => s.active);
          const progressIdx = activeIdx >= 0 ? activeIdx : lastCompletedIdx;
          const progressPercent = progressIdx >= 0 ? (progressIdx / (steps.length - 1)) * 100 : 0;
          
          return (
            <motion.div
              className="absolute top-5 right-5 h-0.5 bg-primary z-[1]"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          );
        })()}

        {steps.map((step, index) => {
          const Icon = step.icon;
          const isCompleted = step.completed;
          const isActive = step.active;
          
          return (
            <motion.div
              key={step.id}
              className="flex flex-col items-center z-10 relative"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.15, duration: 0.4 }}
            >
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-500 ${
                  isCompleted
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30"
                    : isActive
                    ? "bg-primary/20 text-primary border-2 border-primary animate-pulse"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive && step.id === "processing" ? "animate-spin" : ""}`} />
              </div>
              <span
                className={`text-[10px] sm:text-xs mt-2 text-center max-w-[60px] sm:max-w-[80px] leading-tight font-medium ${
                  isCompleted
                    ? "text-primary"
                    : isActive
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
};

export default OrderTimeline;
