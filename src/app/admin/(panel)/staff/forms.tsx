"use client";

import { useActionState } from "react";
import { inviteStaff, updateStaff, type StaffState } from "./actions";

function Result({ state }: { state: StaffState }) {
  if (!state) return null;
  return (
    <div role="status" className={`text-xs font-semibold ${state.ok ? "text-success" : "text-danger"}`}>
      {state.message}
      {state.link && <input readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} className="field mt-1 !py-1.5 font-mono text-[0.7rem]" />}
    </div>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteStaff, null);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <label className="block">
        <span className="label">Name</span>
        <input name="name" required className="field" />
      </label>
      <label className="block">
        <span className="label">Email</span>
        <input name="email" type="email" required className="field" />
      </label>
      <label className="block">
        <span className="label">Role</span>
        <select name="role" defaultValue="staff" className="field">
          <option value="staff">Store staff</option>
          <option value="support">Support</option>
          <option value="manager">Manager</option>
          <option value="owner">Owner</option>
        </select>
      </label>
      <div className="flex items-end">
        <button disabled={pending} className="btn btn-primary btn-sm">{pending ? "Sending…" : "Send invitation"}</button>
      </div>
      <div className="sm:col-span-2"><Result state={state} /></div>
    </form>
  );
}

export function StaffRowActions({ id, role, disabled, self }: { id: string; role: string; disabled: boolean; self: boolean }) {
  const [state, action, pending] = useActionState(updateStaff, null);
  return (
    <form action={action} className="flex max-w-md flex-col items-end gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap justify-end gap-1.5">
        <label className="sr-only" htmlFor={`role-${id}`}>Role</label>
        <select id={`role-${id}`} name="role" defaultValue={role} className="field !w-auto !py-1.5 text-xs">
          <option value="owner">Owner</option>
          <option value="manager">Manager</option>
          <option value="staff">Store staff</option>
          <option value="support">Support</option>
        </select>
        <button name="intent" value="role" disabled={pending} className="btn btn-outline btn-sm !py-1.5 text-xs">Change role</button>
      </div>
      <div className="flex flex-wrap justify-end gap-1.5">
        {!self && <button name="intent" value="reset_password" className="btn btn-ghost btn-sm !py-1 text-xs">Reset password</button>}
        {!self && <button name="intent" value="reset_mfa" className="btn btn-ghost btn-sm !py-1 text-xs">Reset 2-step</button>}
        {!self && <button name="intent" value="signout" className="btn btn-ghost btn-sm !py-1 text-xs">Sign out everywhere</button>}
        {!self && (disabled ? (
          <button name="intent" value="enable" className="btn btn-ghost btn-sm !py-1 text-xs text-success">Enable</button>
        ) : (
          <button name="intent" value="disable" className="btn btn-ghost btn-sm !py-1 text-xs text-danger">Disable</button>
        ))}
      </div>
      <Result state={state} />
    </form>
  );
}
