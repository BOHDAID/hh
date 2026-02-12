import { useState } from "react";
import { motion } from "framer-motion";
import { Package, ShoppingCart, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

import netflixBox from "@/assets/demo-products/netflix-box.png";
import spotifyBox from "@/assets/demo-products/spotify-box.png";
import playstationBox from "@/assets/demo-products/playstation-box.png";
import xboxBox from "@/assets/demo-products/xbox-box.png";
import steamBox from "@/assets/demo-products/steam-box.png";
import itunesBox from "@/assets/demo-products/itunes-box.png";

const demoProducts = [
  { id: "1", name: "Netflix Premium", description: "اشتراك نتفلكس بريميوم - شاشة واحدة", price: 15, image: netflixBox, category: "اشتراكات" },
  { id: "2", name: "Spotify Premium", description: "اشتراك سبوتيفاي بريميوم شهري", price: 10, image: spotifyBox, category: "اشتراكات" },
  { id: "3", name: "PlayStation Plus", description: "اشتراك بلايستيشن بلس 3 أشهر", price: 25, image: playstationBox, category: "ألعاب" },
  { id: "4", name: "Xbox Game Pass", description: "اشتراك إكس بوكس قيم باس شهري", price: 20, image: xboxBox, category: "ألعاب" },
  { id: "5", name: "Steam Wallet", description: "بطاقة ستيم 50 دولار", price: 50, image: steamBox, category: "بطاقات" },
  { id: "6", name: "iTunes Gift Card", description: "بطاقة آيتونز 25 دولار", price: 25, image: itunesBox, category: "بطاقات" },
];

const DemoProductCard = ({ product }: { product: typeof demoProducts[0] }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <motion.div
      className="group relative overflow-hidden rounded-2xl sm:rounded-3xl bg-card border border-border/50 transition-all duration-500"
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
      whileHover={{
        boxShadow: "0 25px 50px -12px hsla(280, 100%, 60%, 0.25)",
        borderColor: "hsla(280, 100%, 60%, 0.3)",
      }}
    >
      {/* Single merged image - product inside the box */}
      <motion.div
        className="relative w-full aspect-square overflow-hidden rounded-t-2xl sm:rounded-t-3xl"
        animate={{ scale: isHovered ? 1.05 : 1 }}
        transition={{ duration: 0.4 }}
      >
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover"
        />

        {/* Category Badge */}
        {product.category && (
          <span className="absolute top-4 right-4 z-20 rounded-full bg-primary px-3 sm:px-4 py-1 sm:py-1.5 text-xs font-bold text-primary-foreground shadow-lg">
            {product.category}
          </span>
        )}
      </motion.div>

      {/* Content */}
      <div className="relative p-4 sm:p-6">
        <h3 className="mb-1 sm:mb-2 text-sm sm:text-lg font-bold text-foreground line-clamp-1">
          {product.name}
        </h3>
        <p className="mb-3 sm:mb-5 text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
          {product.description}
        </p>

        <div className="flex items-center justify-between">
          <motion.div
            className="flex items-baseline gap-1"
            animate={{ scale: isHovered ? 1.05 : 1 }}
            transition={{ duration: 0.2 }}
          >
            <span className="text-xl sm:text-3xl font-extrabold text-primary">{product.price}</span>
            <span className="text-xs sm:text-sm text-muted-foreground font-medium">$</span>
          </motion.div>

          <div className="flex gap-2">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button variant="outline" size="icon" className="h-9 w-9 sm:h-10 sm:w-10 rounded-xl border-2">
                <Eye className="h-4 w-4" />
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Button variant="hero" size="sm" className="gap-2 rounded-xl px-4 sm:px-5 shadow-lg text-xs sm:text-sm">
                <ShoppingCart className="h-4 w-4" />
                شراء
              </Button>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const Demo = () => {
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header />
      <main className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-5xl font-extrabold text-foreground mb-4">🎨 صفحة الديمو</h1>
          <p className="text-muted-foreground text-lg">تصميم تجريبي - المنتج مدمج داخل العلبة كصورة واحدة</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {demoProducts.map((product) => (
            <DemoProductCard key={product.id} product={product} />
          ))}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Demo;
