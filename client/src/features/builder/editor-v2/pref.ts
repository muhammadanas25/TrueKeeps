/**
 * Which customize editor this device uses: the v2 editor (default) or
 * the classic one. A per-device preference in localStorage, not part of
 * the book — switching never changes the book, both editors read and
 * write the same pages.
 *
 * `?editor=classic` / `?editor=v2` in the URL also sets it, which makes
 * support and QA ("open this link") easy.
 */

import { useEffect, useState } from "react";

export type EditorVersion = "v2" | "classic";
const KEY = "tk_editor_version";

function read(): EditorVersion {
  try {
    const q = new URLSearchParams(window.location.search).get("editor");
    if (q === "classic" || q === "v2") {
      localStorage.setItem(KEY, q);
      return q;
    }
    return localStorage.getItem(KEY) === "classic" ? "classic" : "v2";
  } catch {
    return "v2";
  }
}

export function useEditorVersion(): [EditorVersion, (v: EditorVersion) => void] {
  const [v, setV] = useState<EditorVersion>(read);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, v);
    } catch {
      /* private mode — preference lasts for this visit */
    }
  }, [v]);
  return [v, setV];
}
