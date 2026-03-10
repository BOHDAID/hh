import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function errorRes(msg: string, status = 400) {
  return new Response(JSON.stringify({ error: msg }), { status, headers: jsonHeaders });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return errorRes("Unauthorized", 401);
    }

    const externalUrl = Deno.env.get("VITE_EXTERNAL_SUPABASE_URL")!;
    const externalAnonKey = Deno.env.get("VITE_EXTERNAL_SUPABASE_ANON_KEY")!;

    if (!externalUrl || !externalAnonKey) {
      return errorRes("Backend not configured", 500);
    }

    const userClient = createClient(externalUrl, externalAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await userClient.auth.getUser();
    if (authError || !userData?.user) {
      console.error("Auth error:", authError);
      return errorRes("Unauthorized", 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return errorRes("AI not configured", 500);
    }

    const { productImageUrl, boxFrameUrl } = await req.json();

    if (!productImageUrl || !boxFrameUrl) {
      return errorRes("Missing productImageUrl or boxFrameUrl", 400);
    }

    console.log("Merging product image with box frame...");
    console.log("Product:", productImageUrl.substring(0, 100) + "...");
    console.log("Box frame:", boxFrameUrl);

    // Add timeout controller - 50 seconds max (Edge functions have ~60s limit)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    let aiResponse: Response;
    try {
      aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: "google/gemini-3.1-flash-image-preview",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Take the logo/product from the first image and place it LARGE and prominently inside the dark black square area in the center of the second image (the 3D plastic packaging box). The logo should fill about 70-80% of the black square area - make it big and clearly visible. The logo should look like it's printed/embossed on the surface inside the package. The overall result must look like a realistic 3D product box with depth, shadows, and perspective matching the packaging. Keep the purple/pink glowing neon border and the transparent plastic packaging shell exactly as they are. The final image should look like a professional 3D rendered product in its retail packaging. Generate the result as an image.",
                },
                {
                  type: "image_url",
                  image_url: { url: productImageUrl },
                },
                {
                  type: "image_url",
                  image_url: { url: boxFrameUrl },
                },
              ],
            },
          ],
          modalities: ["text", "image"],
        }),
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      if (fetchErr instanceof DOMException && fetchErr.name === "AbortError") {
        console.error("AI request timed out");
        return errorRes("AI processing timed out, please try again", 504);
      }
      throw fetchErr;
    }
    clearTimeout(timeoutId);

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);

      if (aiResponse.status === 429) {
        return errorRes("Rate limited, try again later", 429);
      }
      if (aiResponse.status === 402) {
        return errorRes("AI credits exhausted", 402);
      }
      return errorRes("AI processing failed", 500);
    }

    const aiData = await aiResponse.json();

    const choice = aiData.choices?.[0]?.message;
    const generatedImageUrl =
      choice?.images?.[0]?.image_url?.url ||
      choice?.content?.find?.((c: any) => c.type === "image_url")?.image_url?.url ||
      choice?.content?.find?.((c: any) => c.type === "image")?.image_url?.url ||
      null;

    if (!generatedImageUrl) {
      console.error("No image in AI response:", JSON.stringify(aiData).slice(0, 1000));
      return errorRes("AI did not generate an image", 500);
    }

    const base64Data = generatedImageUrl.replace(/^data:image\/\w+;base64,/, "");
    const imageBytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));

    const fileName = `merged-${Date.now()}-${Math.random().toString(36).substring(7)}.png`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(fileName, imageBytes, {
        contentType: "image/png",
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return errorRes("Failed to save merged image", 500);
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("product-images").getPublicUrl(fileName);

    console.log("Merged image saved:", publicUrl);

    return new Response(JSON.stringify({ mergedImageUrl: publicUrl }), {
      headers: jsonHeaders,
    });
  } catch (error) {
    console.error("merge-product-image error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: jsonHeaders }
    );
  }
});
