"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          backgroundColor: "#f7f9fc",
          color: "#142235",
          fontFamily: "system-ui, sans-serif",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "32px",
        }}
      >
        <h2 style={{ fontSize: "24px", fontWeight: 600 }}>
          Something went wrong
        </h2>
        <button
          onClick={() => reset()}
          style={{
            padding: "8px 16px",
            borderRadius: "10px",
            border: "1px solid #0F766E",
            color: "#0F766E",
            background: "transparent",
            cursor: "pointer",
            fontSize: "15px",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
