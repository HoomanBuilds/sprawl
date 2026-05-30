"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { useState, useEffect, useCallback } from "react";
import {
  getDefaultConfig,
  RainbowKitProvider,
  RainbowKitAuthenticationProvider,
  createAuthenticationAdapter,
  darkTheme,
  type AuthenticationStatus,
} from "@rainbow-me/rainbowkit";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createSiweMessage } from "viem/siwe";
import { mantleSepolia } from "@/lib/chains";
import { MANTLE_SEPOLIA_CHAIN_ID } from "@/lib/config";

const config = getDefaultConfig({
  appName: "The Sprawl",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "YOUR_PROJECT_ID",
  chains: [mantleSepolia],
  ssr: true,
});

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [authStatus, setAuthStatus] = useState<AuthenticationStatus>("loading");

  // Check existing session on mount
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setAuthStatus(d.authenticated ? "authenticated" : "unauthenticated");
      })
      .catch(() => {
        if (!cancelled) setAuthStatus("unauthenticated");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const authAdapter = useCallback(
    () =>
      createAuthenticationAdapter({
        getNonce: async () => {
          const res = await fetch("/api/auth/nonce");
          const { nonce } = await res.json();
          return nonce;
        },
        createMessage: ({ nonce, address, chainId }) =>
          createSiweMessage({
            domain: window.location.host,
            address: address as `0x${string}`,
            statement: "Sign in to The Sprawl — autonomous agent city on Mantle.",
            uri: window.location.origin,
            version: "1",
            chainId: chainId ?? MANTLE_SEPOLIA_CHAIN_ID,
            nonce,
          }),
        verify: async ({ message, signature }) => {
          const res = await fetch("/api/auth/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message, signature }),
          });
          const ok = res.ok;
          if (ok) setAuthStatus("authenticated");
          return ok;
        },
        signOut: async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          setAuthStatus("unauthenticated");
        },
      }),
    []
  );

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitAuthenticationProvider adapter={authAdapter()} status={authStatus}>
          <RainbowKitProvider theme={darkTheme()} modalSize="compact">
            {children}
          </RainbowKitProvider>
        </RainbowKitAuthenticationProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
