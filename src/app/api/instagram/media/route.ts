import { NextResponse } from "next/server";
import { getInstagramRequestContext, markInstagramConnectionRequiresReauthorization } from "@/lib/instagram/auth";
import {
  decryptInstagramToken,
  getInstagramMedia,
  isInstagramAuthorizationError,
} from "@/lib/instagram/server";

const noStore = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const context = await getInstagramRequestContext();
  if (!context.ok) return context.response;
  const connectionId = new URL(request.url).searchParams.get("connectionId");
  if (!connectionId) return NextResponse.json({ error: "Choose an Instagram account." }, { status: 400, headers: noStore });
  const { data: connection, error: connectionError } = await context.admin
    .from("instagram_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("creator_id", context.userId)
    .eq("connection_status", "connected")
    .maybeSingle();
  if (connectionError) {
    console.error("Could not load an Instagram connection for media selection.", connectionError);
    return NextResponse.json({ error: "Instagram media could not be loaded." }, { status: 503, headers: noStore });
  }
  if (!connection?.access_token_encrypted) {
    return NextResponse.json({ error: "Reconnect this Instagram account to continue." }, { status: 409, headers: noStore });
  }
  if (Date.parse(connection.token_expires_at) <= Date.now() + 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Reconnect or refresh this Instagram account before selecting media." }, { status: 409, headers: noStore });
  }
  try {
    const media = await getInstagramMedia(
      connection.instagram_user_id,
      decryptInstagramToken(connection.access_token_encrypted),
    );
    const { data: storefront, error: storefrontError } = await context.admin
      .from("creator_storefronts")
      .select("username")
      .eq("user_id", context.userId)
      .eq("status", "published")
      .is("deleted_at", null)
      .maybeSingle();
    if (storefrontError) throw new Error("Could not load the creator's published storefront.");
    let products: Array<{ id: string; name: string; url: string }> = [];
    if (storefront?.username) {
      const { data, error } = await context.admin
        .from("storefront_products")
        .select("id,name")
        .eq("user_id", context.userId)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw new Error("Could not load products for the storefront link.");
      products = (data ?? []).map((product) => ({
        id: product.id,
        name: product.name,
        url: `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")}/${storefront.username}#product-${product.id}`,
      }));
    }
    return NextResponse.json({
      media,
      storefrontUrl: storefront?.username
        ? `${process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "")}/${storefront.username}#products`
        : null,
      products,
    }, { headers: noStore });
  } catch (error) {
    console.error("Instagram media could not be loaded.", {
      status: error instanceof Error && "status" in error ? error.status : null,
    });
    if (isInstagramAuthorizationError(error)) {
      await markInstagramConnectionRequiresReauthorization(context.admin, connection.id);
      return NextResponse.json({ error: "Instagram authorization expired. Reconnect the account." }, { status: 409, headers: noStore });
    }
    return NextResponse.json({ error: "Instagram media could not be loaded. Try again later." }, { status: 502, headers: noStore });
  }
}
