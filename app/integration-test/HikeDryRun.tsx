"use client";

import { useState } from "react";

type DryRunResult = {
  counts: {
    pagesChecked: number;
    eligibleSales: number;
    lineItemsChecked: number;
    uniqueUpcMatches: number;
  };
  syncEnabled: boolean;
  liveMode: boolean;
};

export default function HikeDryRun() {
  const [result, setResult] = useState<DryRunResult | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    setResult(null);
    setError("");

    try {
      const response = await fetch("/api/hike/sync-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      });
      const data = await response.json();
      if (!response.ok || data.success !== true) {
        throw new Error(data.error ?? "Hike dry run failed");
      }
      setResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Hike dry run failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section>
      <h2>Hike Sales Dry Run</h2>
      <button type="button" onClick={run} disabled={running}>
        {running ? "Checking Hike sales…" : "Run Hike sales dry run"}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <p role="status">
          Checked {result.counts.pagesChecked} pages and found{" "}
          {result.counts.eligibleSales} eligible sales,{" "}
          {result.counts.lineItemsChecked} sale lines, and{" "}
          {result.counts.uniqueUpcMatches} unique UPC matches.
          Live sync {result.syncEnabled && result.liveMode ? "enabled" : "disabled"}.
          Inventory was unchanged.
        </p>
      )}
    </section>
  );
}
