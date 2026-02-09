import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UserSidebar from "@/components/user/UserSidebar";
import {
  HeadphonesIcon,
  Clock,
  CheckCircle,
  MessageSquare,
  Send,
  Loader2,
  ArrowRight,
  AlertCircle,
  Plus,
  X,
  Image as ImageIcon,
  ShoppingBag,
  FileText,
  ExternalLink,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface SupportTicket {
  id: string;
  ticket_number: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
}

interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_type: "user" | "admin";
  sender_id: string | null;
  message: string;
  image_url?: string | null;
  created_at: string;
}

interface UserOrder {
  id: string;
  order_number: string;
  status: string;
  total_amount: number;
  created_at: string;
  payment_method: string | null;
}

const Support = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [ordersDialogOpen, setOrdersDialogOpen] = useState(false);
  const [userOrders, setUserOrders] = useState<UserOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("inquiry");

  useEffect(() => {
    const init = async () => {
      const authClient = isExternalConfigured ? getAuthClient() : db;
      const { data: { session } } = await authClient.auth.getSession();
      if (session?.user) {
        setUserId(session.user.id);
        fetchTickets(session.user.id);
      } else {
        setLoading(false);
      }
    };
    init();
  }, []);

  const fetchTickets = async (uid: string) => {
    const { data } = await db
      .from("support_tickets")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });
    if (data) setTickets(data);
    setLoading(false);
  };

  const fetchMessages = async (ticketId: string) => {
    setLoadingMessages(true);
    const { data, error } = await db
      .from("ticket_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    
    if (error) {
      console.error("Error fetching messages:", error);
    } else if (data) {
      setMessages(data);
    }
    setLoadingMessages(false);
  };

  const fetchUserOrders = async () => {
    if (!userId) return;
    setLoadingOrders(true);
    const { data, error } = await db
      .from("orders")
      .select("id, order_number, status, total_amount, created_at, payment_method")
      .eq("user_id", userId)
      .eq("status", "completed")
      .order("created_at", { ascending: false });
    
    if (error) {
      console.error("Error fetching orders:", error);
    } else if (data) {
      setUserOrders(data);
    }
    setLoadingOrders(false);
  };

  const openOrdersDialog = async () => {
    setOrdersDialogOpen(true);
    await fetchUserOrders();
  };

  const sendOrderReceipt = async (order: UserOrder) => {
    if (!selectedTicket || !userId) return;
    
    const receiptUrl = `${window.location.origin}/order/${order.id}`;
    const messageText = `🧾 إيصال الطلب: ${order.order_number}\n💰 المبلغ: $${order.total_amount.toFixed(2)}\n📅 التاريخ: ${new Date(order.created_at).toLocaleDateString("ar-SA")}\n🔗 رابط الفاتورة: ${receiptUrl}`;
    
    setSendingMessage(true);
    setOrdersDialogOpen(false);
    
    const { error } = await db.from("ticket_messages").insert({
      ticket_id: selectedTicket.id,
      sender_type: "user",
      sender_id: userId,
      message: messageText,
    });

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      if (selectedTicket.status === "replied") {
        await db.from("support_tickets").update({ status: "open" }).eq("id", selectedTicket.id);
        setSelectedTicket({ ...selectedTicket, status: "open" });
        if (userId) fetchTickets(userId);
      }
      await fetchMessages(selectedTicket.id);
      toast({ title: "تم الإرسال", description: "تم إرسال إيصال الطلب" });
    }
    setSendingMessage(false);
  };

  const openTicketChat = async (ticket: SupportTicket) => {
    setSelectedTicket(ticket);
    setMessages([]);
    await fetchMessages(ticket.id);
    setTimeout(() => scrollToBottom(), 100);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  const handleSendMessage = async (imageUrl?: string) => {
    if (!selectedTicket || (!newMessage.trim() && !imageUrl) || !userId) return;

    if (selectedTicket.status === "closed") {
      toast({ title: "التذكرة مغلقة", description: "لا يمكن إرسال رسائل لتذكرة مغلقة", variant: "destructive" });
      return;
    }

    setSendingMessage(true);
    const { error } = await db.from("ticket_messages").insert({
      ticket_id: selectedTicket.id,
      sender_type: "user",
      sender_id: userId,
      message: newMessage.trim() || (imageUrl ? "صورة مرفقة" : ""),
      image_url: imageUrl || null,
    });

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      // Update ticket status to open if it was replied
      if (selectedTicket.status === "replied") {
        await db.from("support_tickets").update({ status: "open" }).eq("id", selectedTicket.id);
        setSelectedTicket({ ...selectedTicket, status: "open" });
        if (userId) fetchTickets(userId);
      }
      setNewMessage("");
      await fetchMessages(selectedTicket.id);
    }
    setSendingMessage(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket || !userId) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({ title: "خطأ", description: "يرجى اختيار صورة فقط", variant: "destructive" });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "خطأ", description: "حجم الصورة يجب أن لا يتجاوز 5MB", variant: "destructive" });
      return;
    }

    setUploadingImage(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/${selectedTicket.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await db.storage
        .from("store-assets")
        .upload(`tickets/${fileName}`, file);

      if (uploadError) throw uploadError;

      const { data: urlData } = db.storage
        .from("store-assets")
        .getPublicUrl(`tickets/${fileName}`);

      if (urlData?.publicUrl) {
        await handleSendMessage(urlData.publicUrl);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({ title: "خطأ في رفع الصورة", description: error.message, variant: "destructive" });
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !subject.trim() || !message.trim()) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    
    // Create ticket
    const { data: ticketData, error: ticketError } = await db.from("support_tickets").insert({
      user_id: userId,
      subject: subject.trim(),
      message: message.trim(),
      priority: reason,
    }).select().single();

    if (ticketError) {
      toast({ title: "خطأ", description: ticketError.message, variant: "destructive" });
    } else if (ticketData) {
      // Add first message to ticket_messages
      await db.from("ticket_messages").insert({
        ticket_id: ticketData.id,
        sender_type: "user",
        sender_id: userId,
        message: message.trim(),
      });

      toast({ title: "تم الإرسال", description: "تم فتح التذكرة بنجاح" });
      setSubject("");
      setMessage("");
      setReason("inquiry");
      setDialogOpen(false);
      fetchTickets(userId);
    }
    setSubmitting(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "closed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "replied":
        return <MessageSquare className="h-4 w-4 text-blue-500" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "closed":
        return "مغلقة";
      case "replied":
        return "تم الرد";
      default:
        return "مفتوحة";
    }
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case "closed":
        return "bg-muted text-muted-foreground";
      case "replied":
        return "bg-blue-500/20 text-blue-500";
      default:
        return "bg-yellow-500/20 text-yellow-500";
    }
  };

  const getReasonClass = (reasonValue: string) => {
    switch (reasonValue) {
      case "refund":
        return "bg-destructive/20 text-destructive";
      case "issue":
        return "bg-orange-500/20 text-orange-400";
      case "suggestion":
        return "bg-green-500/20 text-green-400";
      default:
        return "bg-primary/20 text-primary";
    }
  };

  const getReasonText = (reasonValue: string) => {
    switch (reasonValue) {
      case "refund":
        return "تعويض";
      case "issue":
        return "مشكلة";
      case "suggestion":
        return "اقتراح";
      default:
        return "استفسار";
    }
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
      <UserSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpen={() => setSidebarOpen(true)}
      />

      <main className="container mx-auto px-4 py-8 pt-24">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-primary">الرئيسية</Link>
          <ArrowRight className="h-4 w-4" />
          <span className="text-foreground">الدعم الفني</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-4xl mx-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-primary shadow-glow-primary">
                <HeadphonesIcon className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-foreground">الدعم الفني</h1>
                <p className="text-muted-foreground">تواصل معنا لحل مشاكلك</p>
              </div>
            </div>
            {userId && (
              <Button variant="hero" onClick={() => setDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                تذكرة جديدة
              </Button>
            )}
          </div>

          {/* Login prompt for non-authenticated users */}
          {!loading && !userId && (
            <div className="glass rounded-2xl p-8 text-center mb-8">
              <AlertCircle className="h-12 w-12 text-primary mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-foreground mb-2">سجّل دخولك أولاً</h2>
              <p className="text-muted-foreground mb-4">يجب تسجيل الدخول لفتح تذكرة دعم أو عرض طلباتك</p>
              <Link to="/login">
                <Button variant="hero" className="gap-2">
                  تسجيل الدخول
                  <ArrowRight className="h-4 w-4 rotate-180" />
                </Button>
              </Link>
            </div>
          )}

          {/* Info Cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-8">
            <div className="glass rounded-xl p-4 text-center">
              <Clock className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-semibold text-foreground">وقت الاستجابة</h3>
              <p className="text-sm text-muted-foreground">أقل من 24 ساعة</p>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <HeadphonesIcon className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-semibold text-foreground">دعم متواصل</h3>
              <p className="text-sm text-muted-foreground">7 أيام في الأسبوع</p>
            </div>
            <div className="glass rounded-xl p-4 text-center">
              <CheckCircle className="h-8 w-8 text-primary mx-auto mb-2" />
              <h3 className="font-semibold text-foreground">حلول فعالة</h3>
              <p className="text-sm text-muted-foreground">نسبة رضا 98%</p>
            </div>
          </div>

          {/* Tickets List */}
          <div className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">تذاكري</h2>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">لا توجد تذاكر</p>
                <p className="text-sm text-muted-foreground mt-1">افتح تذكرة جديدة إذا كان لديك استفسار</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tickets.map((ticket) => (
                  <motion.div
                    key={ticket.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-4 rounded-xl bg-muted/30 border border-border cursor-pointer hover:border-primary/30 transition-colors"
                    onClick={() => openTicketChat(ticket)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-muted-foreground font-mono">{ticket.ticket_number}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${getReasonClass(ticket.priority)}`}>
                            {getReasonText(ticket.priority)}
                          </span>
                        </div>
                        <h3 className="font-medium text-foreground truncate">{ticket.subject}</h3>
                        <p className="text-xs text-muted-foreground mt-2">
                          {new Date(ticket.created_at).toLocaleDateString("ar-SA")}
                        </p>
                      </div>
                      <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full shrink-0 ${getStatusClass(ticket.status)}`}>
                        {getStatusIcon(ticket.status)}
                        {getStatusText(ticket.status)}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </main>

      <Footer />

      {/* New Ticket Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="glass max-w-md">
          <DialogHeader>
            <DialogTitle>فتح تذكرة جديدة</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>الموضوع *</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="عنوان مختصر للمشكلة"
                className="glass"
                required
              />
            </div>
            <div className="space-y-2">
              <Label>سبب التواصل</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="glass">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inquiry">استفسار</SelectItem>
                  <SelectItem value="refund">تعويض / استرجاع</SelectItem>
                  <SelectItem value="issue">مشكلة تقنية</SelectItem>
                  <SelectItem value="suggestion">اقتراح</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تفاصيل المشكلة *</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="اشرح مشكلتك بالتفصيل..."
                className="glass"
                rows={5}
                required
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)} className="flex-1">
                إلغاء
              </Button>
              <Button type="submit" variant="hero" disabled={submitting} className="flex-1 gap-2">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                إرسال
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Chat Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="glass max-w-2xl h-[80vh] flex flex-col p-0 overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">{selectedTicket?.subject}</h3>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground font-mono">{selectedTicket?.ticket_number}</span>
                  {selectedTicket && (
                    <span className={`px-2 py-0.5 rounded-full ${getStatusClass(selectedTicket.status)}`}>
                      {getStatusText(selectedTicket.status)}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedTicket(null)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {loadingMessages ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center py-8">
                <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">ابدأ المحادثة</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_type === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      msg.sender_type === "user"
                        ? "bg-primary text-primary-foreground rounded-tl-sm"
                        : "bg-muted/50 text-foreground rounded-tr-sm"
                    }`}
                  >
                    {msg.image_url && (
                      <a href={msg.image_url} target="_blank" rel="noopener noreferrer" className="block mb-2">
                        <img 
                          src={msg.image_url} 
                          alt="مرفق" 
                          className="max-w-full rounded-lg max-h-48 object-cover cursor-pointer hover:opacity-90 transition-opacity"
                        />
                      </a>
                    )}
                    {msg.message && msg.message !== "صورة مرفقة" && (
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.message.split(/(https?:\/\/[^\s]+)/g).map((part, i) => 
                          part.match(/^https?:\/\//) ? (
                            <a 
                              key={i} 
                              href={part} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className={`underline hover:opacity-80 ${msg.sender_type === "user" ? "text-primary-foreground" : "text-primary"}`}
                            >
                              {part.includes('/order/') ? '📄 عرض الفاتورة' : part}
                            </a>
                          ) : (
                            <span key={i}>{part}</span>
                          )
                        )}
                      </p>
                    )}
                    <p className={`text-[10px] mt-1 ${msg.sender_type === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ar })}
                    </p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          {selectedTicket?.status !== "closed" ? (
            <div className="p-4 border-t border-border shrink-0">
              <div className="flex gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage || sendingMessage}
                  title="إرفاق صورة"
                >
                  {uploadingImage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  onClick={openOrdersDialog}
                  disabled={sendingMessage}
                  title="إرسال إيصال طلب"
                >
                  <ShoppingBag className="h-4 w-4" />
                </Button>
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="اكتب رسالتك..."
                  className="min-h-[44px] max-h-32 resize-none"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="hero"
                  size="icon"
                  className="shrink-0 h-11 w-11"
                  onClick={() => handleSendMessage()}
                  disabled={sendingMessage || uploadingImage || !newMessage.trim()}
                >
                  {sendingMessage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <div className="p-4 border-t border-border text-center shrink-0">
              <p className="text-sm text-muted-foreground">هذه التذكرة مغلقة</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Orders Dialog */}
      <Dialog open={ordersDialogOpen} onOpenChange={setOrdersDialogOpen}>
        <DialogContent className="glass max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              {selectedTicket ? "اختر طلب لإرسال الإيصال" : "طلباتي المكتملة"}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto">
            {loadingOrders ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : userOrders.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                <p className="text-muted-foreground text-sm">لا توجد طلبات مكتملة</p>
              </div>
            ) : (
              <div className="space-y-3">
                {userOrders.map((order) => (
                  <div
                    key={order.id}
                    className="p-4 rounded-xl bg-muted/30 border border-border hover:border-primary/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-mono text-sm text-primary">{order.order_number}</p>
                        <p className="text-lg font-bold text-foreground mt-1">
                          ${order.total_amount.toFixed(2)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(order.created_at).toLocaleDateString("ar-SA")}
                        </p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-xs px-2 py-1 rounded-full bg-green-500/20 text-green-500">
                          مكتمل
                        </span>
                        {selectedTicket ? (
                          <Button 
                            variant="hero" 
                            size="sm" 
                            className="gap-1.5 text-xs"
                            onClick={() => sendOrderReceipt(order)}
                            disabled={sendingMessage}
                          >
                            <Send className="h-3 w-3" />
                            إرسال الإيصال
                          </Button>
                        ) : (
                          <Link to={`/order/${order.id}`} target="_blank">
                            <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                              <FileText className="h-3 w-3" />
                              الفاتورة
                              <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Support;