"use client";

import { SOCIAL_PLATFORMS } from "@/lib/social";
import { useActionState, useState } from "react";
import type { CommerceSettings, HomeContent, PolicyPages, StoreInfo } from "@/server/settings";
import { saveCommerce, saveHome, savePolicies, saveShipping, saveStore, type SetState } from "./actions";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Save({ pending, state, label = "Save" }: { pending: boolean; state: SetState; label?: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Saving…" : label}</button>
      {state && <span role="status" className={`text-sm font-semibold ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</span>}
    </div>
  );
}

function T({ label, name, value, hint, ...rest }: { label: string; name: string; value?: string | number | null; hint?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input name={name} defaultValue={value ?? ""} className="field" {...rest} />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function StoreForm({ store }: { store: StoreInfo }) {
  const [state, action, pending] = useActionState(saveStore, null);
  const hour = (d: string) => store.hours.find((h) => h.day === d);
  return (
    <form action={action} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <T label="Store name" name="name" value={store.name} />
        <T label="Legal business name" name="legalName" value={store.legalName} />
        <T label="Tagline" name="tagline" value={store.tagline} />
        <T label="Phone" name="phone" value={store.phone} />
        <T label="Email" name="email" value={store.email} type="email" />
        <T label="Street address" name="streetAddress" value={store.streetAddress} hint="Needed for map listings, structured data and tax on pickup orders." />
        <T label="City" name="city" value={store.city} />
        <div className="grid grid-cols-2 gap-3">
          <T label="State" name="state" value={store.state} maxLength={2} />
          <T label="ZIP" name="zip" value={store.zip} inputMode="numeric" />
        </div>
        <T label="Directions note" name="directionsNote" value={store.directionsNote} />
        <T label="Map search text" name="mapEmbedQuery" value={store.mapEmbedQuery} hint="Used for the map until the street address is set." />
      </div>
      <fieldset>
        <legend className="label">Opening hours (Eastern Time). Leave all blank to show “call for hours”.</legend>
        <div className="grid gap-2">
          {DAYS.map((d) => {
            const h = hour(d);
            return (
              <div key={d} className="grid grid-cols-[7rem_1fr_1fr_auto] items-center gap-2 text-sm">
                <span className="font-semibold">{d}</span>
                <input type="time" name={`open_${d}`} defaultValue={h?.open ?? ""} aria-label={`${d} opens`} className="field !py-1.5" />
                <input type="time" name={`close_${d}`} defaultValue={h?.close ?? ""} aria-label={`${d} closes`} className="field !py-1.5" />
                <label className="flex items-center gap-1.5 text-xs">
                  <input type="checkbox" name={`closed_${d}`} defaultChecked={Boolean(h && !h.open)} className="h-4 w-4 accent-iris-600" /> Closed
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>
      <div className="grid gap-4 md:grid-cols-2">
      </div>
      <fieldset className="space-y-3">
        <legend className="label">Social media pages</legend>
        <p className="text-xs text-muted">
          Paste the store&apos;s page link or just its @handle. Icons appear in the footer, the mobile menu and the Visit page; on phones they open
          straight in the Facebook, Instagram, YouTube or TikTok app. Leave a box empty to hide that icon.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {SOCIAL_PLATFORMS.map((p) => (
            <T key={p.key} label={p.label} name={p.key} value={store[p.key]} placeholder={p.example} autoComplete="off" spellCheck={false} />
          ))}
        </div>
      </fieldset>
      <T label="Google Business Profile URL" name="googleBusinessUrl" value={store.googleBusinessUrl} />
      <Save pending={pending} state={state} />
    </form>
  );
}

export function CommerceForm({ commerce }: { commerce: CommerceSettings }) {
  const [state, action, pending] = useActionState(saveCommerce, null);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <T label="Announcement bar" name="announcement" value={commerce.announcement} maxLength={140} />
        <T label="Returns window (days)" name="returnsWindowDays" value={commerce.returnsWindowDays} type="number" />
        <T label="Checkout hold (minutes)" name="reservationMinutes" value={commerce.reservationMinutes} type="number" hint="How long items are held while the customer pays. Minimum 31 (Stripe's checkout lasts at least 30)." />
        <T label="Default safety stock (units)" name="defaultSafetyStock" value={commerce.defaultSafetyStock} type="number" hint="Units of each new SKU kept back from online sale to absorb in-store sales during sync delays." />
        <T label="Pause SKUs when Clover sync is older than (minutes)" name="staleSyncMinutes" value={commerce.staleSyncMinutes} type="number" />
        <T label="Maximum of one item per order" name="maxQtyPerLine" value={commerce.maxQtyPerLine} type="number" hint="Stops bots and resellers from emptying scarce stock." />
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input type="checkbox" name="pickupEnabled" defaultChecked={commerce.pickupEnabled} className="h-4 w-4 accent-iris-600" /> Offer free in-store pickup
      </label>
      <label className="block">
        <span className="label">Pickup instructions (shown at checkout and in emails)</span>
        <textarea name="pickupInstructions" defaultValue={commerce.pickupInstructions} rows={2} className="field" />
      </label>
      <Save pending={pending} state={state} />
    </form>
  );
}

type Ship = { id: string; name: string; carrier: string; amountCents: number; freeOverCents: number | null; minDays: number; maxDays: number; active: boolean };

export function ShippingForm({ methods }: { methods: Ship[] }) {
  const [state, action, pending] = useActionState(saveShipping, null);
  const [extra, setExtra] = useState(0);
  const rows: Ship[] = [...methods, ...Array.from({ length: extra }, () => ({ id: "", name: "", carrier: "USPS", amountCents: 0, freeOverCents: null, minDays: 3, maxDays: 5, active: true }))];
  return (
    <form action={action} className="space-y-4">
      <p className="text-sm text-muted">Customers pick from these on the Stripe payment page (up to 5). Sales tax on shipping is handled by Stripe Tax.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-muted uppercase">
              <th className="px-2 py-2">Name</th><th className="px-2">Carrier</th><th className="px-2">Price ($)</th><th className="px-2">Free over ($)</th><th className="px-2">Days</th><th className="px-2">On</th><th className="px-2">Remove</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m, i) => (
              <tr key={m.id || `n${i}`}>
                <td className="px-2 py-1.5"><input type="hidden" name="id" value={m.id} /><input name="name" defaultValue={m.name} aria-label="Name" className="field !py-1.5" /></td>
                <td className="px-2"><select name="carrier" defaultValue={m.carrier} aria-label="Carrier" className="field !py-1.5"><option>USPS</option><option>UPS</option><option>FedEx</option><option>Other</option></select></td>
                <td className="px-2"><input name="amount" defaultValue={(m.amountCents / 100).toFixed(2)} aria-label="Price" className="field !w-24 !py-1.5" /></td>
                <td className="px-2"><input name="freeOver" defaultValue={m.freeOverCents != null ? (m.freeOverCents / 100).toFixed(2) : ""} aria-label="Free over" className="field !w-24 !py-1.5" /></td>
                <td className="px-2"><div className="flex items-center gap-1"><input name="minDays" type="number" defaultValue={m.minDays} aria-label="Minimum days" className="field !w-16 !py-1.5" />–<input name="maxDays" type="number" defaultValue={m.maxDays} aria-label="Maximum days" className="field !w-16 !py-1.5" /></div></td>
                <td className="px-2"><input type="checkbox" name="active" value={m.id || `new${i}`} defaultChecked={m.active} aria-label="Active" className="h-4 w-4 accent-iris-600" /></td>
                <td className="px-2">{m.id && <input type="checkbox" name="remove" value={m.id} aria-label="Remove" className="h-4 w-4 accent-red-600" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" onClick={() => setExtra((n) => n + 1)} className="btn btn-outline btn-sm">Add shipping option</button>
      <Save pending={pending} state={state} />
    </form>
  );
}

export function HomeForm({ home }: { home: HomeContent }) {
  const [state, action, pending] = useActionState(saveHome, null);
  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <T label="Hero eyebrow" name="heroEyebrow" value={home.heroEyebrow} />
        <T label="Hero headline" name="heroTitle" value={home.heroTitle} />
        <T label="Hero headline accent (italic)" name="heroAccent" value={home.heroAccent} />
      </div>
      <label className="block">
        <span className="label">Hero text</span>
        <textarea name="heroSubtitle" defaultValue={home.heroSubtitle} rows={2} className="field" />
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="label">Hero photo (optional, portrait works best)</span>
          <input type="file" name="heroImage" accept="image/jpeg,image/png,image/webp,image/avif" className="block w-full text-sm" />
          {home.heroImageUrl && (
            <span className="mt-1 flex items-center gap-2 text-xs">
              Current photo set.
              <label className="flex items-center gap-1"><input type="checkbox" name="removeHeroImage" /> remove</label>
            </span>
          )}
        </label>
        <T label="About section title" name="aboutTitle" value={home.aboutTitle} />
      </div>
      <label className="block">
        <span className="label">About text (blank line between paragraphs)</span>
        <textarea name="aboutBody" defaultValue={home.aboutBody.join("\n\n")} rows={5} className="field" />
      </label>
      <label className="block">
        <span className="label">Stats band — one per line as “value | label”, up to 4. Leave empty for live catalog figures.</span>
        <textarea name="stats" defaultValue={home.stats.map((s) => `${s.value} | ${s.label}`).join("\n")} rows={4} className="field font-mono text-sm" />
      </label>
      <label className="block">
        <span className="label">Customer testimonials — quote, name, source on separate lines; blank line between each</span>
        <textarea name="testimonials" defaultValue={home.testimonials.map((t) => [t.quote, t.name, t.source].join("\n")).join("\n\n")} rows={6} className="field text-sm" />
        <span className="mt-1 block text-xs text-warning">Only publish real reviews from real customers, with their permission (FTC rules). The section is hidden while empty.</span>
      </label>
      <label className="block">
        <span className="label">FAQs — question on the first line, answer below; blank line between each</span>
        <textarea name="faqs" defaultValue={home.faqs.map((q) => `${q.q}\n${q.a}`).join("\n\n")} rows={10} className="field text-sm" />
      </label>
      <Save pending={pending} state={state} />
    </form>
  );
}

export function PoliciesForm({ policies }: { policies: PolicyPages }) {
  const [state, action, pending] = useActionState(savePolicies, null);
  const fields: [keyof PolicyPages, string][] = [
    ["privacy", "Privacy policy"],
    ["terms", "Terms of sale"],
    ["shipping", "Shipping & pickup"],
    ["returns", "Returns policy"],
    ["accessibility", "Accessibility statement"],
  ];
  return (
    <form action={action} className="space-y-5">
      <p className="rounded-xl bg-amber-50 p-3 text-sm text-warning">
        These are starting templates. Have the store&apos;s attorney review them before launch, and make sure they match how the store actually works. Format: “## ” starts a heading, “- ” starts a bullet, blank line between paragraphs.
      </p>
      {fields.map(([k, l]) => (
        <label key={k} className="block">
          <span className="label">{l}</span>
          <textarea name={k} defaultValue={String(policies[k])} rows={10} className="field font-mono text-xs leading-relaxed" />
        </label>
      ))}
      {policies.updatedOn && <p className="text-xs text-muted">Last saved {policies.updatedOn}</p>}
      <Save pending={pending} state={state} label="Save policies" />
    </form>
  );
}
