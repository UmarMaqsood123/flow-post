import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

/**
 * List filters live in the URL, so a filtered view can be shared or reloaded.
 * Changing a filter goes back to page 1.
 */
export function useListParams<K extends string>(keys: readonly K[]) {
  const [searchParams, setSearchParams] = useSearchParams();

  const values = useMemo(() => {
    const result = { page: Number(searchParams.get("page") ?? 1) || 1 } as Record<K, string> & {
      page: number;
    };
    for (const key of keys) (result as Record<string, string>)[key] = searchParams.get(key) ?? "";
    return result;
    // keys is a constant list per page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const setFilter = useCallback(
    (key: K, value: string) =>
      setSearchParams(
        (params) => {
          if (value) params.set(key, value);
          else params.delete(key);
          params.delete("page");
          return params;
        },
        { replace: true },
      ),
    [setSearchParams],
  );

  const setPage = useCallback(
    (page: number) =>
      setSearchParams((params) => {
        params.set("page", String(page));
        return params;
      }),
    [setSearchParams],
  );

  return { values, setFilter, setPage };
}
