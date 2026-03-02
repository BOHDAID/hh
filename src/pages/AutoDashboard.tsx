import { useState } from "react";
import { Link } from "react-router-dom";
import { Bot, ChevronRight, ChevronLeft, Home, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppData } from "@/components/AppInitializer";

const AutoDashboard = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { storeName, storeLogo } = useAppData();

  return (
    <div className="min-h-screen bg-background flex" dir="rtl">
      {/* Sidebar */}
      <aside
        className={cn(
          "h-screen sticky top-0 border-l border-border bg-card flex flex-col transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h2 className="text-sm font-bold text-foreground truncate">لوحة تحكم Telegram</h2>
              <p className="text-xs text-muted-foreground truncate">قريباً...</p>
            </div>
          )}
        </div>

        {/* Empty nav area - will be filled later */}
        <nav className="flex-1 p-3">
          {!collapsed && (
            <p className="text-xs text-muted-foreground text-center mt-8">قريباً...</p>
          )}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-border space-y-2">
          <Link to="/">
            <Button variant="ghost" size="sm" className={cn("w-full", collapsed ? "justify-center px-0" : "justify-start gap-2")}>
              <Home className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="text-xs">الرئيسية</span>}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="w-full"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6">
        <h1 className="text-2xl font-bold mb-2">لوحة تحكم Telegram</h1>
        <p className="text-muted-foreground">قريباً...</p>
      </main>
    </div>
  );
};

export default AutoDashboard;
