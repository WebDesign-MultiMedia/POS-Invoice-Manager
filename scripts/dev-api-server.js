import http from "node:http";
import createPaymentIntent from "../api/create-payment-intent.js";
import receiptUrl from "../api/receipt-url.js";
import sheets from "../api/sheets.js";

// Local stand-in for Vercel's serverless runtime (see vite.config.js's proxy)
// so `api/create-payment-intent.js` can be exercised with `npm run dev`
// instead of requiring `vercel dev`'s account login. Run with:
//   node --env-file=.env.local scripts/dev-api-server.js

const PORT = 3001;

function withVercelShims(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(body));
  };
  return res;
}

const ROUTES = {
  "/api/create-payment-intent": createPaymentIntent,
  "/api/receipt-url": receiptUrl,
  "/api/sheets": sheets,
};

const server = http.createServer(async (req, res) => {
  const route = ROUTES[new URL(req.url, "http://localhost").pathname];
  if (!route) {
    res.writeHead(404).end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      req.body = body ? JSON.parse(body) : {};
    } catch {
      res.writeHead(400).end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    await route(req, withVercelShims(res));
  });
});

server.listen(PORT, () => {
  console.log(`Local /api dev server on http://localhost:${PORT}`);
});
