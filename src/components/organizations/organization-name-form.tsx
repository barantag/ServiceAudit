"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  isOrganizationUpdateResponse,
  MAX_ORGANIZATION_NAME_LENGTH,
  validateOrganizationNameRequest,
} from "@/lib/organizations/organization-contract";

export function OrganizationNameForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [savedName, setSavedName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const validation = validateOrganizationNameRequest({ name });
    if (!validation.ok) {
      setMessage({ error: true, text: validation.message });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/organization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: validation.name }),
      });
      const responseBody: unknown = await response.json();
      if (!isOrganizationUpdateResponse(responseBody)) throw new Error("Invalid response");
      if (!responseBody.ok) {
        setMessage({ error: true, text: responseBody.message });
        return;
      }

      setName(responseBody.organization.name);
      setSavedName(responseBody.organization.name);
      setMessage({ error: false, text: responseBody.message });
      router.refresh();
    } catch {
      setMessage({ error: true, text: "Kuruluş adı güncellenemedi. Lütfen tekrar deneyin." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="mt-6 space-y-5">
      <div>
        <label htmlFor="organization-name" className="mb-2 block text-sm font-semibold text-slate-800">
          Kuruluş adı
        </label>
        <input
          id="organization-name"
          name="name"
          type="text"
          required
          maxLength={MAX_ORGANIZATION_NAME_LENGTH}
          value={name}
          disabled={saving}
          onChange={(event) => { setName(event.target.value); setMessage(null); }}
          aria-describedby="organization-name-help"
          className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100"
        />
        <div id="organization-name-help" className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <p>Bu ad, aktif kuruluş bağlamı olarak uygulama başlığında gösterilir.</p>
          <p>{name.length}/{MAX_ORGANIZATION_NAME_LENGTH} karakter</p>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving || name.trim() === savedName}
        className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-900 px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {saving ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
      </button>

      {message && (
        <p role={message.error ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${message.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {message.text}
        </p>
      )}
    </form>
  );
}
