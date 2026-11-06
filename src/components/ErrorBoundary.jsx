import { Component } from "react";

// Last line of defence: if a page crashes while rendering, staff see a calm
// "reload" screen instead of a blank white page. The order form keeps its
// draft in sessionStorage, so reloading doesn't lose a half-typed order.
// Plain inline styles, because the crash may have come from the styled
// components themselves.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("App crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main
        role="alert"
        style={{
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          padding: "24px",
          textAlign: "center",
          background: "#2447d6",
          color: "#ffffff",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <i className="fa-solid fa-triangle-exclamation" aria-hidden="true" style={{ fontSize: "40px" }}></i>
        <h1 style={{ fontSize: "24px", fontWeight: 700, margin: 0 }}>Something went wrong</h1>
        <p style={{ fontSize: "16px", maxWidth: "32rem", margin: 0, lineHeight: 1.5 }}>
          The page hit an unexpected problem. Reload to keep going — any order you were typing is saved.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            fontSize: "16px",
            fontWeight: 600,
            padding: "12px 28px",
            borderRadius: "999px",
            border: "none",
            background: "#ffffff",
            color: "#10178b",
            cursor: "pointer",
          }}
        >
          Reload
        </button>
      </main>
    );
  }
}
