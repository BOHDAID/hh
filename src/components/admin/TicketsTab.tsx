import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/supabaseClient";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Ticket,
  MessageSquare,
  Clock,
  User,
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  Search,
  Filter,
  X,
  Lock,
  Image as ImageIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface SupportTicket {
  id: string;
  ticket_number: string;
  user_id: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  admin_reply: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { email: string; full_name: string | null } | null;
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

const TicketsTab = () => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    setLoading(true);
    const { data, error } = await db
      .from("support_tickets")
      .select("*, profiles!support_tickets_user_id_fkey(email, full_name)")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching tickets:", error);
      const { data: ticketsOnly } = await db
        .from("support_tickets")
        .select("*")
        .order("created_at", { ascending: false });
      if (ticketsOnly) setTickets(ticketsOnly);
    } else if (data) {
      setTickets(data);
    }
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
    if (!selectedTicket || (!newMessage.trim() && !imageUrl)) return;

    setSendingMessage(true);
    const {
      data: { user },
      error: userError,
    } = await db.auth.getUser();

    if (userError || !user) {
      toast({
        title: "خطأ",
        description: "يجب تسجيل الدخول لإرسال رسالة",
        variant: "destructive",
      });
      setSendingMessage(false);
      return;
    }

    const { error } = await db.from("ticket_messages").insert({
      ticket_id: selectedTicket.id,
      sender_type: "admin",
      sender_id: user.id,
      message: newMessage.trim() || (imageUrl ? "صورة مرفقة" : ""),
      image_url: imageUrl || null,
    });

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      // Update ticket status to replied
      await db.from("support_tickets").update({ 
        status: "replied",
        admin_reply: newMessage.trim() || "صورة مرفقة",
        replied_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", selectedTicket.id);

      setSelectedTicket({ ...selectedTicket, status: "replied" });
      setNewMessage("");
      await fetchMessages(selectedTicket.id);
      fetchTickets();
      toast({ title: "✅ تم الإرسال", description: "تم إرسال الرد بنجاح" });
    }
    setSendingMessage(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedTicket) return;

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
      const { data: { user } } = await db.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const fileExt = file.name.split(".").pop();
      const fileName = `admin/${selectedTicket.id}/${Date.now()}.${fileExt}`;

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

  const updateTicketStatus = async (ticketId: string, newStatus: string) => {
    const { error } = await db
      .from("support_tickets")
      .update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ticketId);

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ تم التحديث", description: "تم تحديث حالة التذكرة" });
      if (selectedTicket && selectedTicket.id === ticketId) {
        setSelectedTicket({ ...selectedTicket, status: newStatus });
      }
      fetchTickets();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open":
        return <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> مفتوحة</Badge>;
      case "replied":
        return <Badge variant="secondary" className="gap-1 bg-blue-500/20 text-blue-400"><MessageSquare className="h-3 w-3" /> تم الرد</Badge>;
      case "closed":
        return <Badge variant="outline" className="gap-1 bg-green-500/20 text-green-400"><CheckCircle className="h-3 w-3" /> مغلقة</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getReasonBadge = (reasonValue: string) => {
    switch (reasonValue) {
      case "refund":
        return <Badge variant="destructive">تعويض</Badge>;
      case "issue":
        return <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30">مشكلة</Badge>;
      case "suggestion":
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">اقتراح</Badge>;
      default:
        return <Badge variant="secondary">استفسار</Badge>;
    }
  };

  const filteredTickets = tickets.filter((ticket) => {
    const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;
    const matchesSearch =
      searchQuery === "" ||
      ticket.ticket_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ticket.message.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const openTicketsCount = tickets.filter((t) => t.status === "open").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">تذاكر الدعم</h1>
          {openTicketsCount > 0 && (
            <Badge variant="destructive" className="text-sm">
              {openTicketsCount} مفتوحة
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-initial">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="بحث..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-9 w-full sm:w-64"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <Filter className="h-4 w-4 ml-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="open">مفتوحة</SelectItem>
              <SelectItem value="replied">تم الرد</SelectItem>
              <SelectItem value="closed">مغلقة</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {filteredTickets.length === 0 ? (
        <div className="glass rounded-xl p-12 text-center">
          <Ticket className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">لا توجد تذاكر</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredTickets.map((ticket) => (
            <div
              key={ticket.id}
              className="glass rounded-xl p-4 hover:border-primary/50 transition-colors cursor-pointer"
              onClick={() => openTicketChat(ticket)}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="font-mono text-sm text-primary">
                      #{ticket.ticket_number}
                    </span>
                    {getStatusBadge(ticket.status)}
                    {getReasonBadge(ticket.priority)}
                  </div>
                  <h3 className="font-semibold text-foreground mb-1 truncate">
                    {ticket.subject}
                  </h3>
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {ticket.profiles?.full_name || ticket.profiles?.email || "مستخدم"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(ticket.created_at), {
                        addSuffix: true,
                        locale: ar,
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={ticket.status === "open" ? "hero" : "outline"}
                    onClick={(e) => {
                      e.stopPropagation();
                      openTicketChat(ticket);
                    }}
                  >
                    <MessageSquare className="h-4 w-4 ml-1" />
                    محادثة
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chat Dialog */}
      <Dialog open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <DialogContent className="glass max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden">
          {/* Chat Header */}
          <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="p-2 rounded-lg bg-primary/20 shrink-0">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-foreground truncate">{selectedTicket?.subject}</h3>
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <span className="text-muted-foreground font-mono">{selectedTicket?.ticket_number}</span>
                  {selectedTicket && getReasonBadge(selectedTicket.priority)}
                  <span className="text-muted-foreground">
                    <User className="h-3 w-3 inline ml-1" />
                    {selectedTicket?.profiles?.full_name || selectedTicket?.profiles?.email || "مستخدم"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Select
                value={selectedTicket?.status || "open"}
                onValueChange={(value) => {
                  if (selectedTicket) {
                    updateTicketStatus(selectedTicket.id, value);
                  }
                }}
              >
                <SelectTrigger className="w-28 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">مفتوحة</SelectItem>
                  <SelectItem value="replied">تم الرد</SelectItem>
                  <SelectItem value="closed">مغلقة</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="ghost" size="icon" onClick={() => setSelectedTicket(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
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
                <p className="text-muted-foreground text-sm">لا توجد رسائل</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.sender_type === "admin" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      msg.sender_type === "admin"
                        ? "bg-primary text-primary-foreground rounded-tl-sm"
                        : "bg-muted/50 text-foreground rounded-tr-sm"
                    }`}
                  >
                    <div className={`text-[10px] mb-1 font-medium ${msg.sender_type === "admin" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {msg.sender_type === "admin" ? "أنت" : "العميل"}
                    </div>
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
                              className={`underline hover:opacity-80 ${msg.sender_type === "admin" ? "text-primary-foreground" : "text-primary"}`}
                            >
                              {part.includes('/order/') ? '📄 عرض الفاتورة' : part}
                            </a>
                          ) : (
                            <span key={i}>{part}</span>
                          )
                        )}
                      </p>
                    )}
                    <p className={`text-[10px] mt-1 ${msg.sender_type === "admin" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
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
                >
                  {uploadingImage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </Button>
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="اكتب ردك..."
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
            <div className="p-4 border-t border-border text-center shrink-0 flex items-center justify-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">هذه التذكرة مغلقة</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TicketsTab;