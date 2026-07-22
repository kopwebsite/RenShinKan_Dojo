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

  if (message) return <section className="payment-proof-upload payment-proof-upload--complete" aria-live="polite">
    <div className="payment-proof-upload__heading"><CheckCircle2 aria-hidden="true" /><div><p className="eyebrow">Upload complete</p><h4>Payslip received</h4><p>{message}</p></div></div>
    <div className="payment-proof-upload__next"><ShieldCheck aria-hidden="true" /><p><strong>What happens next</strong><span>A sensei will review the image and update the payment status. You do not need to upload it again.</span></p></div>
    <small><ShieldCheck size={14} /> Your image is private and will be automatically deleted after 60 days.</small>
  </section>;

  return <section className="payment-proof-upload" aria-live="polite">
    <div className="payment-proof-upload__heading"><ImageUp aria-hidden="true" /><div><p className="eyebrow">Payment confirmation</p><h4>Upload your payslip</h4><p>The dojo cannot confirm your {paymentLabel} payment until you upload proof of payment.</p></div></div>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={(event) => void upload(event.target.files?.[0])} />
    <div className="payment-proof-upload__action"><button className="btn-primary" type="button" disabled={busy} onClick={() => input.current?.click()}>
      {busy ? <LoaderCircle className="spin" size={17} /> : <ImageUp size={17} />}
      {busy ? "Uploading payslip…" : "Choose payslip image"}
    </button><small><ShieldCheck size={14} /> JPEG, PNG, or WebP up to 5 MB · private · deleted after 60 days</small></div>
    <p className="payment-proof-upload__fallback"><strong>Cannot upload?</strong> If you are unable to upload the payslip, please send it directly to a sensei of RenShinKan Dojo.</p>
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
