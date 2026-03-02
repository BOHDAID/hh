import { db, getAuthClient } from "@/lib/supabaseClient";

export type AdminAction = "create" | "update" | "delete" | "login" | "logout" | "ban" | "unban" | "approve" | "reject";
export type TargetType = "product" | "order" | "user" | "category" | "coupon" | "review" | "ticket" | "setting" | "flash_sale" | "variant" | "account" | "team" | "policy";

interface LogParams {
  action: AdminAction;
  targetType: TargetType;
  targetId?: string;
  details?: Record<string, unknown>;
}

export async function logAdminAction({ action, targetType, targetId, details }: LogParams): Promise<void> {
  try {
    const authClient = getAuthClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return;

    await db.from("admin_activity_logs").insert({
      user_id: user.id,
      action,
      target_type: targetType,
      target_id: targetId || null,
      details: details || {},
    });
  } catch (err) {
    console.error("Failed to log admin action:", err);
  }
}
