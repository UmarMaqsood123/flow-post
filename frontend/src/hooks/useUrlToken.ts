import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

/**
 * Reads `?token=` once, then strips it from the address bar so the secret
 * doesn't linger in browser history, screenshots or Referer headers.
 */
function useUrlToken(): string | null {
  const location = useLocation();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(location.search).get("token"));

  useEffect(() => {
    if (new URLSearchParams(location.search).has("token")) {
      navigate(location.pathname, { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  return token;
}

export default useUrlToken;
