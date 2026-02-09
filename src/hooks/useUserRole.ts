import { useState, useEffect } from "react";
import { db, getAuthClient, isExternalConfigured } from "@/lib/supabaseClient";

export type AppRole = "admin" | "full_access" | "support" | "user";

export type TabType =
  | "dashboard"
  | "analytics"
  | "settings"
  | "products"
  | "accounts"
  | "categories"
  | "orders"
  | "users"
  | "reviews"
  | "requests"
  | "affiliates"
  | "messages"
  | "team"
  | "tickets"
  | "coupons"
  | "flash_sales"
  | "policies"
  | "logs"
  | "activation_codes";

// Role permissions map
export const rolePermissions: Record<AppRole, TabType[]> = {
  admin: [
    "dashboard",
    "analytics",
    "settings",
    "products",
    "accounts",
    "categories",
    "orders",
    "users",
    "reviews",
    "requests",
    "affiliates",
    "messages",
    "team",
    "tickets",
    "coupons",
    "flash_sales",
    "policies",
    "logs",
    "activation_codes",
  ],
  full_access: [
    "dashboard",
    "analytics",
    "products",
    "accounts",
    "categories",
    "orders",
    "users",
    "reviews",
    "requests",
    "affiliates",
    "messages",
    "tickets",
    "coupons",
    "flash_sales",
    "logs",
  ],
  support: ["messages", "requests", "tickets"],
  user: [],
};

export const useUserRole = () => {
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const authClient = isExternalConfigured ? getAuthClient() : db;
    const fetchRole = async () => {
      const {
        data: { session },
      } = await authClient.auth.getSession();

      if (!session) {
        setLoading(false);
        return;
      }

      setUserId(session.user.id);

      const { data, error } = await db
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (data?.role) {
        setRole(data.role as AppRole);
      } else {
        setRole("user");
      }

      setLoading(false);
    };

    fetchRole();
  }, []);

  const hasPermission = (tab: TabType): boolean => {
    if (!role) return false;
    return rolePermissions[role]?.includes(tab) ?? false;
  };

  const canAccessAdmin = (): boolean => {
    return role !== null && role !== "user";
  };

  const getAllowedTabs = (): TabType[] => {
    if (!role) return [];
    return rolePermissions[role] || [];
  };

  return {
    role,
    loading,
    userId,
    hasPermission,
    canAccessAdmin,
    getAllowedTabs,
  };
};
