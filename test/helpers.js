// Minimal stand-ins for Vercel's req/res objects, so the /api handlers can be
// called directly in tests without a server.

export function mockReq({ method = "GET", url = "/", headers = {}, body, cookie } = {}) {
  return {
    method,
    url,
    body,
    headers: { ...headers, ...(cookie ? { cookie } : {}) },
    socket: { remoteAddress: "127.0.0.1" },
  };
}

export function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: undefined,
    ended: false,
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
    },
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      res.ended = true;
      return res;
    },
    end(payload) {
      if (payload !== undefined) res.body = payload;
      res.ended = true;
      return res;
    },
  };
  return res;
}

// Turns a Set-Cookie header into the Cookie request header a browser sends.
export function cookieFrom(res) {
  return String(res.headers["set-cookie"] || "").split(";")[0];
}
