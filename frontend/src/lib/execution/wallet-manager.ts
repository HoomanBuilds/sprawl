import { Wallet } from "ethers";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { getSupabaseAdmin } from "../supabase";
import { getMantleSepoliaProvider } from "../ethers-provider";

const ENCRYPTION_KEY = process.env.BACKEND_ENCRYPTION_KEY || "";

function encrypt(text: string): {
  encrypted: string;
  iv: string;
  authTag: string;
} {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    iv
  );
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return { encrypted, iv: iv.toString("hex"), authTag };
}

function decrypt(encrypted: string, iv: string, authTag: string): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(ENCRYPTION_KEY, "hex"),
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(authTag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export async function createAgentWallet(
  agentId: number
): Promise<{ wallet: Wallet; address: string }> {
  const randomWallet = Wallet.createRandom();
  const privateKey = randomWallet.privateKey;
  const address = randomWallet.address;

  const { encrypted, iv, authTag } = encrypt(privateKey);

  const supabase = getSupabaseAdmin();
  await supabase.from("agent_wallets").insert({
    agent_id: agentId,
    encrypted_private_key: encrypted,
    iv,
    auth_tag: authTag,
    wallet_address: address,
  });

  const provider = getMantleSepoliaProvider();
  return { wallet: new Wallet(privateKey, provider), address };
}

export async function getAgentWallet(agentId: number): Promise<Wallet> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("agent_wallets")
    .select("encrypted_private_key, iv, auth_tag")
    .eq("agent_id", agentId)
    .single();

  if (error || !data) {
    throw new Error(`No wallet found for agent ${agentId}`);
  }

  const privateKey = decrypt(
    data.encrypted_private_key,
    data.iv,
    data.auth_tag
  );
  const provider = getMantleSepoliaProvider();
  return new Wallet(privateKey, provider);
}
