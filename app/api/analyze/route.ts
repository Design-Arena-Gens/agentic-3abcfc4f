import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import dayjs from 'dayjs';
import { parse } from 'csv-parse/sync';

type Row = {
  SYMBOL: string;
  SERIES: string;
  OPEN: string;
  HIGH: string;
  LOW: string;
  CLOSE: string;
  TOTTRDQTY: string;
  TOTTRDVAL: string;
};

type Aggregated = {
  symbol: string;
  sumVolume: number;
  sumTradedValue: number;
  sumMFVolume: number; // sum of (MFM * Volume)
  firstClose?: number;
  lastClose?: number;
  days: number;
};

function buildArchiveUrl(d: dayjs.Dayjs): string {
  const yyyy = d.format('YYYY');
  const mmm = d.format('MMM').toUpperCase();
  const ddmmmYYYY = d.format('DDMMMYYYY').toUpperCase();
  return `https://archives.nseindia.com/content/historical/EQUITIES/${yyyy}/${mmm}/cm${ddmmmYYYY}bhav.csv.zip`;
}

async function fetchZipCsvBuffer(url: string): Promise<Buffer | null> {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121 Safari/537.36',
      'accept': 'application/zip,application/octet-stream,*/*',
      'referer': 'https://www.nseindia.com/',
      'cache-control': 'no-cache'
    },
    // cache: 'no-store' // ensure fresh
  });
  if (!res.ok) return null;
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function unzipFirstCsv(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const firstFile = Object.values(zip.files)[0];
  if (!firstFile) throw new Error('Empty ZIP');
  const content = await firstFile.async('string');
  return content;
}

function safeNumber(v: string): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export async function POST() {
  try {
    const neededDays = 5;
    const maxLookback = 12; // include weekends/holidays buffer
    let cursor = dayjs();

    const dailyMaps: Map<string, Row>[] = [];

    while (dailyMaps.length < neededDays && dailyMaps.length + (dayjs().diff(cursor, 'day')) <= neededDays + maxLookback) {
      cursor = cursor.subtract(1, 'day');
      // Skip weekends quickly
      if ([6, 0].includes(cursor.day())) continue;
      const url = buildArchiveUrl(cursor);
      try {
        const buf = await fetchZipCsvBuffer(url);
        if (!buf) continue;
        const csvText = await unzipFirstCsv(buf);
        const records = parse(csvText, {
          columns: true,
          skip_empty_lines: true
        }) as Row[];
        const map = new Map<string, Row>();
        for (const r of records) {
          if (!r || r.SERIES !== 'EQ') continue;
          map.set(r.SYMBOL, r);
        }
        if (map.size > 0) dailyMaps.push(map);
      } catch (_) {
        // ignore and continue
      }
    }

    if (dailyMaps.length === 0) {
      return NextResponse.json({ error: 'No recent trading days found in NSE archives.' }, { status: 502 });
    }

    // Aggregate across symbols
    const agg = new Map<string, Aggregated>();

    // Iterate days in chronological order
    const chronological = [...dailyMaps].reverse();

    for (let i = 0; i < chronological.length; i++) {
      const dayMap = chronological[i];
      for (const [symbol, r] of dayMap.entries()) {
        const high = safeNumber(r.HIGH);
        const low = safeNumber(r.LOW);
        const close = safeNumber(r.CLOSE);
        const volume = safeNumber(r.TOTTRDQTY);
        const tradedValue = safeNumber(r.TOTTRDVAL);

        if (volume <= 0 || high <= 0 || low <= 0) continue;

        const range = high - low;
        const mfm = range === 0 ? 0 : ((close - low) - (high - close)) / range; // [-1,1]
        const mfv = mfm * volume;

        const a = agg.get(symbol) || { symbol, sumVolume: 0, sumTradedValue: 0, sumMFVolume: 0, days: 0 };
        a.sumVolume += volume;
        a.sumTradedValue += tradedValue;
        a.sumMFVolume += mfv;
        a.days += 1;

        if (a.firstClose === undefined) a.firstClose = close; // first in chronological order
        a.lastClose = close; // keep updating to last

        agg.set(symbol, a);
      }
    }

    let results = Array.from(agg.values())
      .filter(a => a.days >= Math.max(3, Math.min(5, dailyMaps.length)))
      .map(a => {
        const cmf = a.sumVolume === 0 ? 0 : a.sumMFVolume / a.sumVolume;
        const priceChange5dPercent = a.firstClose && a.lastClose && a.firstClose > 0
          ? ((a.lastClose - a.firstClose) / a.firstClose) * 100
          : 0;
        return {
          symbol: a.symbol,
          cmf,
          totalTradedValue: a.sumTradedValue,
          totalVolume: a.sumVolume,
          daysCount: a.days,
          priceChange5dPercent
        };
      });

    // Rank by CMF, boost by liquidity (traded value)
    results.sort((x, y) => {
      const liqX = Math.log10(1 + x.totalTradedValue);
      const liqY = Math.log10(1 + y.totalTradedValue);
      const scoreX = x.cmf * (1 + 0.15 * liqX);
      const scoreY = y.cmf * (1 + 0.15 * liqY);
      return scoreY - scoreX;
    });

    const topStocks = results.slice(0, 10);

    return NextResponse.json({
      daysAnalyzed: dailyMaps.length,
      topStocks
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
