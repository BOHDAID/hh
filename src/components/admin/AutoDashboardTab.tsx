import { Bot, Radio, Podcast, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const AutoDashboardTab = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">لوحة النشر التلقائي</h2>
        <p className="text-muted-foreground mt-1">تحكم في النشر التلقائي عبر تليجرام والبودكاست</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-dashed border-2 border-muted-foreground/30">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Send className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-lg">النشر عبر تليجرام</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              إدارة النشر التلقائي للمنتجات والعروض عبر قنوات تليجرام
            </p>
            <div className="mt-4 text-xs text-muted-foreground/60 bg-muted/50 rounded-lg p-3 text-center">
              🚧 قريباً
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed border-2 border-muted-foreground/30">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Podcast className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-lg">البودكاست</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              إدارة حلقات البودكاست والنشر التلقائي
            </p>
            <div className="mt-4 text-xs text-muted-foreground/60 bg-muted/50 rounded-lg p-3 text-center">
              🚧 قريباً
            </div>
          </CardContent>
        </Card>

        <Card className="border-dashed border-2 border-muted-foreground/30">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Radio className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-lg">البث المباشر</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              أدوات إدارة البث المباشر والتحكم فيه
            </p>
            <div className="mt-4 text-xs text-muted-foreground/60 bg-muted/50 rounded-lg p-3 text-center">
              🚧 قريباً
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AutoDashboardTab;
