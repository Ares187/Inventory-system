
"use client";

import { useState } from "react";

type TestResult = {
  saleId: string;
  eventId: number;
  status: string;
  before: number;
  after: number;
  expectedAfter: number;
  passed: boolean;
  isReplay: boolean;
  error: string | null;
  statuses?: string[];
  errors?: (string | null)[];
  testType?: string;
};

export default function TestSaleButton() {
  const [result, setResult] = useState<TestResult | null>(null);
  const [lastSaleId, setLastSaleId] = useState<string | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runTest(replay: boolean) {
    if (loading) return;

    if (replay && !lastSaleId) {
      setError("No previous sale available to replay.");
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const response = await fetch("/api/integration-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          replay ? { saleId: lastSaleId } : {}
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error || "Integration test failed"
        );
      }

      setResult(data);

      if (!replay && data.passed) {
        setLastSaleId(data.saleId);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown error"
      );
    } finally {
      setLoading(false);
    }
  }

async function runFailureTest() {
  if (loading) return;

  setLoading(true);
  setResult(null);
  setError(null);

  try {
    const response = await fetch("/api/integration-test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "insufficient_inventory",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Failure test request failed"
      );
    }

    setResult(data);
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Unknown error"
    );
  } finally {
    setLoading(false);
  }
}

async function runConcurrencyTest() {
  if (loading) return;

  setLoading(true);
  setResult(null);
  setError(null);

  try {
    const response = await fetch("/api/integration-test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "concurrent_duplicate",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error || "Concurrency test request failed"
      );
    }

    setResult(data);
  } catch (err) {
    setError(
      err instanceof Error
        ? err.message
        : "Unknown error"
    );
  } finally {
    setLoading(false);
  }
}

  return (
    <section
      style={{
        border: "1px solid #d1d5db",
        borderRadius: "8px",
        padding: "20px",
        marginTop: "24px",
        marginBottom: "24px",
      }}
    >
      <h2>Simulated Hike Sale</h2>

      <p>
        Test the sale-processing service using an
        isolated store and product.
      </p>

      <p>
        A new sale deducts 2 test pairs. Replaying
        the same sale should deduct nothing.
      </p>

      <div
        style={{
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
          marginTop: "16px",
        }}
      >
        <button
          type="button"
          onClick={() => runTest(false)}
          disabled={loading}
          style={{
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: "6px",
            padding: "12px 18px",
            cursor: loading ? "wait" : "pointer",
            fontWeight: "bold",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Running..." : "Run New Test Sale"}
        </button>

        <button
          type="button"
          onClick={() => runTest(true)}
          disabled={loading || !lastSaleId}
          style={{
            background: "#374151",
            color: "white",
            border: "none",
            borderRadius: "6px",
            padding: "12px 18px",
            cursor:
              loading || !lastSaleId
                ? "not-allowed"
                : "pointer",
            fontWeight: "bold",
            opacity: loading || !lastSaleId ? 0.5 : 1,
          }}
        >
          Replay Previous Sale
        </button>

<button
  type="button"
  onClick={() => runFailureTest()}
  disabled={loading}
  style={{
    background: "#b45309",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "12px 18px",
    cursor: loading ? "wait" : "pointer",
    fontWeight: "bold",
    opacity: loading ? 0.6 : 1,
  }}
>
  Test Insufficient Inventory
</button>

<button
  type="button"
  onClick={runConcurrencyTest}
  disabled={loading}
  style={{
    background: "#7c3aed",
    color: "white",
    border: "none",
    borderRadius: "6px",
    padding: "12px 18px",
    cursor: loading ? "wait" : "pointer",
    fontWeight: "bold",
    opacity: loading ? 0.6 : 1,
  }}
>
  Test Concurrent Duplicate
</button>

      </div>

      {!lastSaleId && (
        <p style={{ marginTop: "12px", fontSize: "14px" }}>
          Run one new test sale to enable replay.
        </p>
      )}

      {error && (
        <p style={{ color: "#dc2626", marginTop: "16px" }}>
          Error: {error}
        </p>
      )}

      {result && (
        <div style={{ marginTop: "20px" }}>
          <h3
            style={{
              color: result.passed ? "#16a34a" : "#dc2626",
            }}
          >
            {result.passed
              ? "TEST PASSED"
              : "TEST FAILED"}
          </h3>

          <p>
            Test type:{" "}
            {result.isReplay ? "Duplicate sale" : "New sale"}
          </p>
          <p>Sale ID: {result.saleId}</p>
{result.eventId !== undefined && (
  <p>Event ID: {result.eventId}</p>
)}
{result.testType === "concurrent_duplicate" ? (
  <>
    <p>Test type: Concurrent duplicate sale</p>
    <p>
      Request 1 status: {result.statuses?.[0] ?? "Unknown"}
    </p>
    <p>
      Request 2 status: {result.statuses?.[1] ?? "Unknown"}
    </p>
    {result.errors?.map((message, index) =>
      message ? (
        <p
          key={index}
          style={{ color: "#dc2626" }}
        >
          Request {index + 1} error: {message}
        </p>
      ) : null
    )}
  </>
) : (
  <p>Status: {result.status}</p>
)}
          <p>Inventory before: {result.before}</p>
          <p>Inventory after: {result.after}</p>
          <p>
            Expected inventory: {result.expectedAfter}
          </p>

          {result.error && (
            <p style={{ color: "#dc2626" }}>
              {result.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
