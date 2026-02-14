import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import useStoreBranding from "@/hooks/useStoreBranding";

interface StoreLogoProps {
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { container: "h-10 w-10 rounded-xl", icon: "h-5 w-5", text: "text-xl", img: "h-10 w-10 rounded-xl" },
  md: { container: "h-12 w-12 rounded-xl", icon: "h-6 w-6", text: "text-2xl", img: "h-12 w-12 rounded-xl" },
  lg: { container: "h-14 w-14 rounded-2xl", icon: "h-7 w-7", text: "text-3xl", img: "h-14 w-14 rounded-2xl" },
};

const StoreLogo = ({ size = "md", animated = false, className = "" }: StoreLogoProps) => {
  const { storeName, storeLogo } = useStoreBranding();
  const s = sizeMap[size];

  const logoElement = storeLogo ? (
    <img src={storeLogo} alt={storeName} className={`${s.img} object-contain`} />
  ) : (
    <div className={`flex items-center justify-center ${s.container} bg-gradient-primary shadow-glow-primary`}>
      <ShoppingBag className={`${s.icon} text-primary-foreground`} />
    </div>
  );

  const wrappedLogo = animated ? (
    <motion.div whileHover={{ scale: 1.05, rotate: 5 }}>
      {logoElement}
    </motion.div>
  ) : logoElement;

  return (
    <Link to="/" className={`inline-flex items-center gap-3 ${className}`}>
      {wrappedLogo}
      <span className={`${s.text} font-bold text-foreground`}>{storeName}</span>
    </Link>
  );
};

export default StoreLogo;
