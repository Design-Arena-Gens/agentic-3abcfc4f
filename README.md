# NSE Stealth Accumulation Scanner

A Next.js app that downloads the last five trading days of NSE Equity bhavcopy from archives and computes 5-day Chaikin Money Flow (CMF) to identify potential stealth accumulation by institutions. Deployed on Vercel.

- API: `POST /api/analyze`
- UI: Single-page table with top 10 symbols ranked by CMF and liquidity.

