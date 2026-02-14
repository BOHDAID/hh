import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { invokeCloudFunction } from "@/lib/cloudFunctions";

interface PayPalSmartButtonsProps {
  amount: number;
  currency?: string;
  orderId: string;
  accessToken: string;
  onSuccess: (paypalOrderId: string) => void;
  onError: (error: string) => void;
  onCancel?: () => void;
  clientId: string;
}

declare global {
  interface Window {
    paypal?: any;
  }
}

const PayPalSmartButtons = ({
  amount,
  currency = "USD",
  orderId,
  accessToken,
  onSuccess,
  onError,
  onCancel,
  clientId,
}: PayPalSmartButtonsProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sdkReady, setSdkReady] = useState(false);
  const buttonsContainerRef = useRef<HTMLDivElement>(null);
  const buttonsRendered = useRef(false);

  // Load PayPal SDK with Apple Pay enabled
  useEffect(() => {
    if (window.paypal) {
      setSdkReady(true);
      setLoading(false);
      return;
    }

    const script = document.createElement("script");
    // Enable Apple Pay via enable-funding parameter
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currency}&enable-funding=applepay,venmo,paylater`;
    script.async = true;
    script.dataset.sdkIntegrationSource = "lovable";
    
    script.onload = () => {
      setSdkReady(true);
      setLoading(false);
    };
    
    script.onerror = () => {
      setLoading(false);
      onError("فشل تحميل PayPal SDK");
    };
    
    document.body.appendChild(script);

    return () => {
      // Don't remove the script on cleanup as it might be reused
    };
  }, [clientId, currency, onError]);

  // Render PayPal buttons when SDK is ready
  useEffect(() => {
    if (!sdkReady || !window.paypal || !buttonsContainerRef.current || buttonsRendered.current) {
      return;
    }

    buttonsRendered.current = true;

    window.paypal
      .Buttons({
        style: {
          layout: "vertical",
          color: "blue",
          shape: "rect",
          label: "paypal",
          tagline: false,
        },
        // Funding sources - Apple Pay is enabled via SDK URL, not disallowed here
        fundingSource: undefined,
        
        createOrder: async () => {
          try {
            // Call our backend to create a PayPal order
            const response = await invokeCloudFunction<{
              success: boolean;
              paypal_order_id?: string;
              error?: string;
            }>(
              "paypal-create",
              { 
                order_id: orderId, 
                amount, 
                currency,
                return_order_id: true // Tell backend to return PayPal order ID instead of approval URL
              },
              accessToken
            );

            if (response.error || !response.data?.success || !response.data?.paypal_order_id) {
              throw new Error(response.data?.error || "Failed to create PayPal order");
            }

            return response.data.paypal_order_id;
          } catch (error) {
            console.error("PayPal createOrder error:", error);
            onError(error instanceof Error ? error.message : "Failed to create order");
            throw error;
          }
        },
        
        onApprove: async (data: { orderID: string }) => {
          try {
            // Capture the payment via our backend
            const response = await invokeCloudFunction<{
              success: boolean;
              error?: string;
            }>(
              "paypal-capture",
              { paypal_order_id: data.orderID, order_id: orderId },
              accessToken
            );

            if (response.error || !response.data?.success) {
              throw new Error(response.data?.error || "Failed to capture payment");
            }

            onSuccess(data.orderID);
          } catch (error) {
            console.error("PayPal capture error:", error);
            onError(error instanceof Error ? error.message : "Failed to complete payment");
          }
        },
        
        onCancel: () => {
          toast({
            title: "تم إلغاء الدفع",
            description: "يمكنك المحاولة مرة أخرى",
            variant: "default",
          });
          onCancel?.();
        },
        
        onError: (err: Error) => {
          console.error("PayPal error:", err);
          onError("حدث خطأ في PayPal");
        },
      })
      .render(buttonsContainerRef.current)
      .catch((err: Error) => {
        console.error("PayPal render error:", err);
        setLoading(false);
      });
  }, [sdkReady, amount, currency, orderId, accessToken, onSuccess, onError, onCancel, toast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="mr-2 text-muted-foreground">جاري تحميل PayPal...</span>
      </div>
    );
  }

  return (
    <div className="paypal-buttons-container">
      <div ref={buttonsContainerRef} className="w-full" />
      <p className="text-xs text-center text-muted-foreground mt-3">
        يدعم Apple Pay على أجهزة iOS و macOS
      </p>
    </div>
  );
};

export default PayPalSmartButtons;
