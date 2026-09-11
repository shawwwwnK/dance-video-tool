import type { NextFunction, Request, Response } from "express";

const allowedPorts = new Set(["5173", "5174"]);

function isAllowedHost(value: string | undefined) {
  if (!value) return false;
  const [hostname, port] = value.toLowerCase().split(":");
  return (hostname === "127.0.0.1" || hostname === "localhost") && !!port && allowedPorts.has(port);
}

function isAllowedOrigin(value: string | undefined) {
  if (!value) return true; // non-browser local clients have no Origin; browsers always send one cross-site.
  try {
    const origin = new URL(value);
    return isAllowedHost(origin.host) && (origin.protocol === "http:" || origin.protocol === "https:");
  } catch {
    return false;
  }
}

export function localRequestOnly(req: Request, res: Response, next: NextFunction) {
  if (!isAllowedHost(req.get("host"))) return res.status(403).json({ error: "Untrusted Host header." });
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!req.get("origin") || !isAllowedOrigin(req.get("origin"))) return res.status(403).json({ error: "Untrusted Origin header." });
    if (req.get("x-lindyloop-request") !== "1") return res.status(403).json({ error: "Missing local request header." });
  }
  next();
}
