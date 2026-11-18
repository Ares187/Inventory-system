
type IntegrationEvent = {
  id: number;
  provider: string;
  external_event_id: string;
  event_type: string;
  status: string;
  error_message: string | null;
  received_at: string;
};

type Props = {
  events: IntegrationEvent[];
};

export default function IntegrationMonitor({
  events,
}: Props) {
  const failed = events.filter(
    (event) => event.status === "failed"
  );

  const waiting = events.filter(
    (event) =>
      event.status === "ready" ||
      event.status === "pending"
  );

  const applied = events.filter(
    (event) => event.status === "applied"
  );

  return (
    <section
      style={{
        border: "1px solid #d1d5db",
        borderRadius: "8px",
        padding: "20px",
        marginTop: "24px",
      }}
    >
      <h2>Integration Monitoring</h2>

      <div
        style={{
          display: "flex",
          gap: "16px",
          flexWrap: "wrap",
          marginBottom: "24px",
        }}
      >
        <div>
          <strong>Applied:</strong> {applied.length}
        </div>
        <div>
          <strong>Failed:</strong> {failed.length}
        </div>
        <div>
          <strong>Waiting:</strong> {waiting.length}
        </div>
      </div>

      <h3>Unresolved Events</h3>

      {failed.length === 0 && waiting.length === 0 ? (
        <p>No unresolved integration events.</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
            }}
          >
            <thead>
              <tr>
                <th>Event</th>
                <th>Provider</th>
                <th>Status</th>
                <th>Error</th>
                <th>Received</th>
              </tr>
            </thead>

            <tbody>
              {[...failed, ...waiting].map((event) => (
                <tr key={event.id}>
                  <td>{event.external_event_id}</td>
                  <td>{event.provider}</td>
                  <td>{event.status}</td>
                  <td>
                    {event.error_message ?? "—"}
                  </td>
                  <td>
                    {new Date(
                      event.received_at
                    ).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
