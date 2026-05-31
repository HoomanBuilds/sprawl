import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getMantleSepoliaProvider } from '@/lib/ethers-provider';
import { Contract, formatEther } from 'ethers';
import { CONTRACTS } from '@/lib/config';
import SprawlDEXAbi from '@/constants/abi/SprawlDEX.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = getSupabaseAdmin();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: trades } = await supabase
    .from('trade_history')
    .select('created_at, token_in, token_out, amount_in, amount_out')
    .or(`token_in.eq.SPRAWL,token_out.eq.SPRAWL`)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(200);

  const pricePoints: { ts: string; price: number }[] = [];

  if (trades && trades.length > 0) {
    for (const trade of trades) {
      // amount_in/out are wei-scale; the 1e18 cancels in the ratio, so a plain
      // numeric ratio is both correct and safe (no huge-BigInt / formatEther).
      const inA = Number(trade.amount_in);
      const outA = Number(trade.amount_out);
      const price = trade.token_in === 'SPRAWL' ? outA / inA : inA / outA;
      if (isFinite(price) && price > 0) {
        pricePoints.push({ ts: trade.created_at, price });
      }
    }
  }

  if (pricePoints.length < 10) {
    const { data: snapshots } = await supabase
      .from('price_snapshots')
      .select('created_at, price')
      .eq('pool_id', 'SPRAWL_sUSDC')
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(200);

    if (snapshots) {
      for (const snap of snapshots) {
        pricePoints.push({ ts: snap.created_at, price: parseFloat(snap.price) });
      }
      pricePoints.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
    }
  }

  let livePrice = 1.0;
  try {
    const provider = getMantleSepoliaProvider();
    const dex = new Contract(CONTRACTS.SprawlDEX, SprawlDEXAbi.abi, provider);
    const raw = await dex.getPrice(CONTRACTS.SPRAWL, CONTRACTS.sUSDC);
    livePrice = Number(formatEther(raw));
  } catch {
    if (pricePoints.length > 0) {
      livePrice = pricePoints[pricePoints.length - 1].price;
    }
  }

  pricePoints.push({ ts: new Date().toISOString(), price: livePrice });

  const oldestPrice = pricePoints.length > 1 ? pricePoints[0].price : livePrice;
  const change24h = oldestPrice > 0 ? ((livePrice - oldestPrice) / oldestPrice) * 100 : 0;

  return NextResponse.json({
    currentPrice: livePrice,
    change24h: Math.round(change24h * 100) / 100,
    history: pricePoints,
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30' },
  });
}
