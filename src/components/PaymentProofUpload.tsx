import { CheckCircle2, ImageUp, LoaderCircle, ShieldCheck } from "lucide-react";
import { useRef, useState } from "react";

export type PaymentProofAccess = { proofId: string; uploadToken: string };

export function PaymentProofUpload({ access, paymentLabel }: { access: PaymentProofAccess; paymentLabel: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const form = new FormData();
      form.set("proofId", access.proofId);
      form.set("uploadToken", access.uploadToken);
      form.set("file", file);
      const response = await fetch("/api/payment-proofs", { method: "POST", headers: { "X-Request-ID": crypto.randomUUID() }, body: form });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "The payslip could not be uploaded.");
      setMessage("Payslip submitted. A sensei can now review and confirm your payment.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The payslip could not be uploaded.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return <section className="payment-proof-upload" aria-live="polite">
    <div><ImageUp aria-hidden="true" /><div><h4>Upload your payslip</h4><p>The dojo cannot confirm your {paymentLabel} payment until you upload proof of payment.</p></div></div>
    <p className="payment-proof-upload__fallback">If you are unable to upload the payslip, please send it directly to a sensei of RenShinKan Dojo.</p>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(event) => void upload(event.target.files?.[0])} />
    <button className="btn-primary" type="button" disabled={busy || Boolean(message)} onClick={() => input.current?.click()}>
      {busy ? <LoaderCircle className="spin" size={17} /> : message ? <CheckCircle2 size={17} /> : <ImageUp size={17} />}
      {busy ? "Uploading payslip…" : message ? "Payslip submitted" : "Upload payslip"}
    </button>
    <small><ShieldCheck size={14} /> JPEG, PNG, or WebP up to 5 MB. The image is private and automatically deleted after 60 days.</small>
    {message ? <p className="form-success"><CheckCircle2 size={17} /> {message}</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
