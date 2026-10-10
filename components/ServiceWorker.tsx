"use client";

import { useEffect } from "react";

/** Registra o service worker que torna o site instalável. Em desenvolvimento não registra. */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => { /* instalação é opcional */ });
  }, []);
  return null;
}
