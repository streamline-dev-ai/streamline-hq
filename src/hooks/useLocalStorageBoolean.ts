import { useEffect, useState } from "react";

export function useLocalStorageBoolean(key: string, initialValue: boolean) {
  const [value, setValue] = useState<boolean>(() => {
    const raw = localStorage.getItem(key);
    if (raw === null) return initialValue;
    return raw === "true";
  });

  useEffect(() => {
    localStorage.setItem(key, value ? "true" : "false");
  }, [key, value]);

  return [value, setValue] as const;
}

