import { useEffect, useState } from "react";

export default function App() {
  const [status, setStatus] = useState("checking...");

  useEffect(() => {
    fetch("/api/health")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setStatus(`Flask says: ${data.status}`))
      .catch((err) => setStatus(`Failed: ${err.message}`));
  }, []);

  return <h1>{status}</h1>;
}