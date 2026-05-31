export function avatarUrl(agentId: number, url?: string | null): string {
  return url ?? `https://api.dicebear.com/9.x/pixel-art/png?seed=agent${agentId}&size=256`;
}
