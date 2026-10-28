"use client";

import { useEffect } from "react";

/** Submits a GET filter form when a select/checkbox changes (inputs submit on Enter/blur). */
export function AutoSubmit({ formId }: { formId: string }) {
  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const submit = () => {
      // Drop empty fields so URLs stay clean.
      for (const el of Array.from(form.elements) as HTMLInputElement[]) {
        if (el.name && !el.value) el.disabled = true;
      }
      form.requestSubmit();
    };
    const onChange = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.tagName === "SELECT" || t.type === "checkbox") submit();
      else if (t.tagName === "INPUT") {
        clearTimeout(timer);
        timer = setTimeout(submit, 700);
      }
    };
    form.addEventListener("change", onChange);
    return () => form.removeEventListener("change", onChange);
  }, [formId]);
  return null;
}
