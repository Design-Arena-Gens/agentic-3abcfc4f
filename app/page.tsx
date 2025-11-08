'use client';

import { useState } from 'react';

type StockRow = {
  symbol: string;
  cmf: number;
  totalTradedValue: number;
  totalVolume: number;
  daysCount: number;
  priceChange5dPercent: number;
};

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<StockRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
    setRows(null);
    try {
      const res = await fetch('/api/analyze', { method: 'POST' });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      setRows(data.topStocks as StockRow[]);
    } catch (e: any) {
      setError(e?.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <div className="header">
        <div className="title">NSE Stealth Accumulation Scanner <span className="badge">CMF 5D</span></div>
        <button className="btn" onClick={runAnalysis} disabled={loading}>
          {loading ? 'Analyzing?' : 'Analyze last 5 trading days'}
        </button>
      </div>

      <div className="card">
        <div className="small">This estimates institutional accumulation using 5-day Chaikin Money Flow from daily bhavcopy. Higher CMF with large traded value suggests accumulation.</div>
        {error && <div style={{ color: '#fda4af', marginTop: 12 }}>Error: {error}</div>}

        {rows && (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Symbol</th>
                <th>CMF (5D)</th>
                <th>Total Traded Value</th>
                <th>Total Volume</th>
                <th>5D Price %</th>
                <th>Days</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.symbol}>
                  <td>{i + 1}</td>
                  <td>{r.symbol}</td>
                  <td>{r.cmf.toFixed(3)}</td>
                  <td>?{Math.round(r.totalTradedValue).toLocaleString('en-IN')}</td>
                  <td>{Math.round(r.totalVolume).toLocaleString('en-IN')}</td>
                  <td>{r.priceChange5dPercent.toFixed(2)}%</td>
                  <td>{r.daysCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="footer">
        Data source: NSE archives bhavcopy. Only series <code>EQ</code> considered. If a day is a holiday/weekend, it is skipped.
      </div>
    </div>
  );
}
